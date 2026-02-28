package com.clawpaw.phonecontrol

import android.util.Log
import kotlinx.coroutines.*
import okhttp3.*
import okio.ByteString
import java.util.concurrent.TimeUnit

/**
 * WebSocket client — connects to the backend and keeps the connection alive
 * via OkHttp's built-in ping/pong heartbeat.
 *
 * URL: ws://<host>/ws?uid=<uid>
 * Reconnects automatically with exponential back-off on failure.
 */
class WsClient(
    private val uid: String,
    private val wsBaseUrl: String,           // e.g. ws://host:3000
    private val onStatusChange: (connected: Boolean) -> Unit,
    /** Called on every incoming text message; return value is sent back as a response. */
    private val onCommand: (suspend (String) -> String?)? = null,
) {
    companion object {
        private const val TAG = "WsClient"
        private const val BASE_RETRY_DELAY = 500L
        private const val RETRY_MULTIPLIER = 1.5
        private const val MAX_RETRY_DELAY = 15_000L
    }

    enum class State { DISCONNECTED, CONNECTING, CONNECTED, ERROR }

    @Volatile var state: State = State.DISCONNECTED
        private set

    private val client = OkHttpClient.Builder()
        .pingInterval(0, TimeUnit.SECONDS)  // disable OkHttp ping — server handles heartbeat
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private var ws: okhttp3.WebSocket? = null
    private var scope: CoroutineScope? = null

    @Volatile private var shouldReconnect = false

    fun connect() {
        shouldReconnect = true
        scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        scope?.launch { connectWithRetry() }
    }

    fun disconnect() {
        shouldReconnect = false
        scope?.cancel()
        scope = null
        ws?.close(1000, "logout")
        ws = null
        setState(State.DISCONNECTED)
    }

    private fun setState(s: State) {
        state = s
        onStatusChange(s == State.CONNECTED)
    }

    private suspend fun connectWithRetry() {
        var retryCount = 0
        while (shouldReconnect) {
            try {
                openSocket()
                return  // socket opened — callbacks manage lifecycle
            } catch (e: Exception) {
                Log.e(TAG, "Connection attempt ${retryCount + 1} failed: ${e.message}")
                setState(State.ERROR)
            }
            retryCount++
            if (!shouldReconnect) break
            val delay = (BASE_RETRY_DELAY * Math.pow(RETRY_MULTIPLIER, (retryCount - 1).toDouble()))
                .toLong().coerceAtMost(MAX_RETRY_DELAY)
            Log.d(TAG, "Retrying in ${delay}ms…")
            delay(delay)
        }
    }

    private fun openSocket() {
        setState(State.CONNECTING)
        val url = "$wsBaseUrl/ws?uid=${uid}"
        Log.i(TAG, "Connecting to $url")

        val request = Request.Builder().url(url).build()
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: okhttp3.WebSocket, response: Response) {
                Log.i(TAG, "WS connected uid=$uid")
                setState(State.CONNECTED)
            }

            override fun onMessage(webSocket: okhttp3.WebSocket, text: String) {
                Log.d(TAG, "Received: $text")
                if (onCommand != null) {
                    scope?.launch {
                        val response = onCommand.invoke(text)
                        if (response != null && state == State.CONNECTED) {
                            Log.d(TAG, "Sending response: $response")
                            webSocket.send(response)
                        }
                    }
                }
            }

            // Pong frames from server (response to OkHttp's auto-ping)
            override fun onMessage(webSocket: okhttp3.WebSocket, bytes: ByteString) {
                Log.d(TAG, "pong ← server (${bytes.size} bytes)")
            }

            override fun onClosed(webSocket: okhttp3.WebSocket, code: Int, reason: String) {
                Log.i(TAG, "WS closed code=$code reason=$reason")
                ws = null
                setState(State.DISCONNECTED)
                if (shouldReconnect) scope?.launch { connectWithRetry() }
            }

            override fun onFailure(webSocket: okhttp3.WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WS failure: ${t.message}")
                ws = null
                setState(State.ERROR)
                if (shouldReconnect) scope?.launch { connectWithRetry() }
            }
        })
    }
}
