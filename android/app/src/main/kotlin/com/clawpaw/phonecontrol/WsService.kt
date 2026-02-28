package com.clawpaw.phonecontrol

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

private const val TAG = "WsService"
private const val CHANNEL_ID = "clawpaw_ws"
private const val NOTIF_ID = 1

/**
 * Foreground Service — keeps the WebSocket connection alive even when
 * the app is in the background or the screen is off.
 *
 * Start with: Intent(context, WsService::class.java).also {
 *     it.putExtra("uid", uid)
 *     startForegroundService(it)
 * }
 * Bind with: bindService(...) to get status callbacks via setStatusListener().
 */
class WsService : Service() {

    inner class LocalBinder : Binder() {
        val service get() = this@WsService
    }

    private val binder = LocalBinder()
    private var wsClient: WsClient? = null
    private var statusListener: ((Boolean) -> Unit)? = null
    private var sshStatusListener: ((SshTunnelManager.State) -> Unit)? = null
    private lateinit var dispatcher: CommandDispatcher
    private val sshTunnel = SshTunnelManager()
    private var wakeLock: PowerManager.WakeLock? = null

    // ── Lifecycle ────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        dispatcher = CommandDispatcher(this)
        autoEnableAccessibility()
        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ClawPaw::SshKeepAlive")
            .also { it.acquire() }
    }

    /**
     * Auto-enable ClawAccessibilityService using WRITE_SECURE_SETTINGS.
     * This permission is NOT granted at install time — it must be granted once via adb:
     *   adb shell pm grant com.clawpaw.phonecontrol android.permission.WRITE_SECURE_SETTINGS
     * After that, the app can enable its own accessibility service silently on every launch.
     */
    private fun autoEnableAccessibility() {
        val component = "$packageName/.ClawAccessibilityService"
        try {
            val resolver = contentResolver
            val current = Settings.Secure.getString(
                resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: ""
            if (!current.contains(component)) {
                val updated = if (current.isBlank()) component else "$current:$component"
                Settings.Secure.putString(
                    resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, updated
                )
                Settings.Secure.putInt(resolver, Settings.Secure.ACCESSIBILITY_ENABLED, 1)
                Log.i(TAG, "AccessibilityService auto-enabled")
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "WRITE_SECURE_SETTINGS not granted — run: adb shell pm grant $packageName android.permission.WRITE_SECURE_SETTINGS")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Handle reconnect_ssh action triggered by CommandDispatcher
        if (intent?.action == "com.clawpaw.ACTION_RECONNECT_SSH") {
            Log.i(TAG, "Received ACTION_RECONNECT_SSH — reconnecting SSH tunnel")
            reconnectSsh()
            return START_NOT_STICKY
        }

        val uid = intent?.getStringExtra("uid") ?: run {
            Log.e(TAG, "Started without uid, stopping")
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(NOTIF_ID, buildNotification("Connecting…"))

        if (wsClient == null) {
            wsClient = WsClient(
                uid = uid,
                wsBaseUrl = BuildConfig.WS_URL,
                onStatusChange = { connected ->
                    updateNotification(if (connected) "Connected ✓" else "Reconnecting…")
                    statusListener?.invoke(connected)
                },
                onCommand = { raw -> dispatcher.dispatch(raw) }
            )
            wsClient?.connect()
            Log.i(TAG, "WsClient started for uid=$uid")
        }

        // Start SSH reverse tunnel if configured
        val prefs = getSharedPreferences("ssh_config", MODE_PRIVATE)
        val sshHost = prefs.getString("host", "") ?: ""
        if (sshHost.isNotBlank()) {
            val config = SshConfig(
                host = sshHost,
                port = prefs.getInt("port", 22),
                username = prefs.getString("username", "") ?: "",
                password = prefs.getString("password", "") ?: "",
                remoteAdbPort = prefs.getInt("adb_port", 9000),
            )
            sshTunnel.start(config) { state ->
                Log.i(TAG, "SSH tunnel state: $state")
                sshStatusListener?.invoke(state)
            }
            Log.i(TAG, "SSH tunnel started → ${config.host}:${config.remoteAdbPort}")
        }

        return START_STICKY   // restart automatically if killed
    }

    override fun onBind(intent: Intent): IBinder = binder

    override fun onDestroy() {
        wsClient?.disconnect()
        wsClient = null
        sshTunnel.stop()
        wakeLock?.release()
        wakeLock = null
        super.onDestroy()
    }

    // ── Public API (used by bound Activity) ─────────────────────────────────

    fun setStatusListener(l: ((Boolean) -> Unit)?) { statusListener = l }
    fun setSshStatusListener(l: ((SshTunnelManager.State) -> Unit)?) { sshStatusListener = l }

    fun isConnected() = wsClient?.state == WsClient.State.CONNECTED

    fun reconnectWs() {
        wsClient?.disconnect()
        wsClient?.connect()
    }

    fun reconnectSsh() {
        val prefs = getSharedPreferences("ssh_config", MODE_PRIVATE)
        val host = prefs.getString("host", "") ?: ""
        if (host.isNotBlank()) {
            sshTunnel.stop()
            val config = SshConfig(
                host = host,
                port = prefs.getInt("port", 22),
                username = prefs.getString("username", "") ?: "",
                password = prefs.getString("password", "") ?: "",
                remoteAdbPort = prefs.getInt("adb_port", 9000),
            )
            sshTunnel.start(config) { state ->
                sshStatusListener?.invoke(state)
            }
        }
    }

    fun sshState() = sshTunnel.state
    fun sshLastError() = sshTunnel.lastError

    data class DebugInfo(
        val wsState: String,
        val wsReconnects: Int,
        val wsLastConnected: String,
        val wsLastFailed: String,
        val wsLastError: String,
        val sshState: String,
        val sshReconnects: Int,
        val sshLastConnected: String,
        val sshLastFailed: String,
        val sshLastError: String,
        val sshHost: String,
        val sshRemotePort: Int,
    )

    fun getDebugInfo(): DebugInfo {
        val prefs = getSharedPreferences("ssh_config", MODE_PRIVATE)
        val fmt = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
        fun ts(ms: Long) = if (ms == 0L) "—" else fmt.format(java.util.Date(ms))
        val ws = wsClient
        val ssh = sshTunnel
        return DebugInfo(
            wsState        = ws?.state?.name ?: "—",
            wsReconnects   = ws?.reconnectCount ?: 0,
            wsLastConnected = ts(ws?.lastConnectedAt ?: 0L),
            wsLastFailed   = ts(ws?.lastFailedAt ?: 0L),
            wsLastError    = ws?.lastError ?: "—",
            sshState       = ssh.state.name,
            sshReconnects  = ssh.reconnectCount,
            sshLastConnected = ts(ssh.lastConnectedAt),
            sshLastFailed  = ts(ssh.lastFailedAt),
            sshLastError   = ssh.lastError ?: "—",
            sshHost        = prefs.getString("host", "—") ?: "—",
            sshRemotePort  = prefs.getInt("adb_port", 0),
        )
    }

    fun saveSshConfig(host: String, port: Int) {
        val prefs = getSharedPreferences("ssh_config", MODE_PRIVATE)
        prefs.edit().apply {
            putString("host", host)
            putInt("port", port)
            apply()
        }
        // Restart tunnel with new config (username/password/adb_port already stored during provision)
        sshTunnel.stop()
        if (host.isNotBlank()) {
            val config = SshConfig(
                host = host,
                port = port,
                username = prefs.getString("username", "") ?: "",
                password = prefs.getString("password", "") ?: "",
                remoteAdbPort = prefs.getInt("adb_port", 9000),
            )
            sshTunnel.start(config) { state ->
                Log.i(TAG, "SSH tunnel state: $state")
                sshStatusListener?.invoke(state)
            }
        }
    }

    // ── Notification ─────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "ClawPaw Connection",
            NotificationManager.IMPORTANCE_LOW   // silent, no sound
        ).apply { description = "Keeps your phone reachable in the background" }

        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }

    private fun buildNotification(status: String): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("ClawPaw")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .build()

    private fun updateNotification(status: String) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification(status))
    }
}
