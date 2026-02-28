package com.clawpaw.phonecontrol

import android.util.Log
import com.jcraft.jsch.JSch
import com.jcraft.jsch.Session
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.Properties
import kotlin.math.pow

private const val TAG = "SshTunnelManager"

data class SshConfig(
    val host: String,
    val port: Int = 22,
    val username: String,
    val password: String,
    val remoteAdbPort: Int,   // port exposed on server → maps to phone ADB 5555
    val localAdbPort: Int = 5555,
)

class SshTunnelManager {

    enum class State { DISCONNECTED, CONNECTING, CONNECTED, ERROR }

    @Volatile var state: State = State.DISCONNECTED
        private set

    @Volatile var lastError: String? = null
        private set
    @Volatile var reconnectCount: Int = 0
        private set
    @Volatile var lastConnectedAt: Long = 0L
        private set
    @Volatile var lastFailedAt: Long = 0L
        private set

    private var session: Session? = null
    private var heartbeatJob: Job? = null
    private var scope: CoroutineScope? = null

    @Volatile private var shouldReconnect = false

    fun start(config: SshConfig, onStateChange: ((State) -> Unit)? = null) {
        shouldReconnect = true
        scope?.cancel()
        scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        scope!!.launch {
            connectWithRetry(config, onStateChange)
        }
    }

    fun stop() {
        shouldReconnect = false
        heartbeatJob?.cancel()
        scope?.cancel()
        scope = null
        disconnect()
        state = State.DISCONNECTED
    }

    fun isConnected(): Boolean {
        val s = session ?: return false
        if (!s.isConnected) return false
        return try { s.sendKeepAliveMsg(); true } catch (e: Exception) { false }
    }

    private suspend fun connectWithRetry(config: SshConfig, onStateChange: ((State) -> Unit)?) {
        var attempt = 0
        while (shouldReconnect) {
            try {
                connect(config, onStateChange)
                // connected — start heartbeat and wait
                attempt = 0
                startHeartbeat(config, onStateChange)
                return
            } catch (e: Exception) {
                Log.e(TAG, "Attempt ${attempt + 1} failed: ${e.message}")
                lastError = e.message
            }
            attempt++
            if (shouldReconnect) {
                val delayMs = (500L * 1.5.pow(attempt - 1).toLong()).coerceAtMost(15_000L)
                Log.d(TAG, "Retry in ${delayMs}ms")
                setState(State.CONNECTING, onStateChange)
                delay(delayMs)
            }
        }
    }

    private fun connect(config: SshConfig, onStateChange: ((State) -> Unit)?) {
        setState(State.CONNECTING, onStateChange)
        try {
            val jsch = JSch()
            val s = jsch.getSession(config.username, config.host, config.port).apply {
                setPassword(config.password)
                setConfig(Properties().apply {
                    put("StrictHostKeyChecking", "no")
                    put("ServerAliveInterval", "30")
                    put("ServerAliveCountMax", "3")
                })
                connect(10_000)
                // Reverse tunnel: server:remoteAdbPort → phone:5555
                setPortForwardingR(config.remoteAdbPort, "127.0.0.1", config.localAdbPort)
                Log.i(TAG, "ADB tunnel: ${config.host}:${config.remoteAdbPort} → localhost:${config.localAdbPort}")
            }
            session = s
            lastError = null
            lastConnectedAt = System.currentTimeMillis()
            setState(State.CONNECTED, onStateChange)
        } catch (e: Exception) {
            lastError = e.message
            lastFailedAt = System.currentTimeMillis()
            reconnectCount++
            setState(State.ERROR, onStateChange)
            disconnect()
            throw e
        }
    }

    private fun startHeartbeat(config: SshConfig, onStateChange: ((State) -> Unit)?) {
        heartbeatJob?.cancel()
        heartbeatJob = scope!!.launch {
            while (isActive && shouldReconnect) {
                delay(30_000L)
                if (!isConnected()) {
                    Log.w(TAG, "Heartbeat failed — reconnecting")
                    ConnectionLog.log("SSH", "heartbeat failed — reconnecting")
                    setState(State.CONNECTING, onStateChange)
                    disconnect()
                    connectWithRetry(config, onStateChange)
                    return@launch
                }
            }
        }
    }

    private fun disconnect() {
        try { session?.disconnect() } catch (_: Exception) {}
        session = null
    }

    private fun setState(s: State, onStateChange: ((State) -> Unit)?) {
        ConnectionLog.log("SSH", if (s == State.ERROR) "ERROR: ${lastError ?: "unknown"}" else s.name)
        state = s
        onStateChange?.invoke(s)
    }
}
