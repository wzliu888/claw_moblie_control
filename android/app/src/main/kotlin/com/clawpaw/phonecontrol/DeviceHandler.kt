package com.clawpaw.phonecontrol

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import com.google.gson.JsonObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Handles device info commands dispatched by [CommandDispatcher].
 */
class DeviceHandler(private val context: Context) {

    // ── Battery ───────────────────────────────────────────────────────────────

    suspend fun battery(params: JsonObject): Any {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?: throw IllegalStateException("Battery info unavailable")
        val level   = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale   = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        val status  = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val temp    = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0
        val pct     = if (scale > 0) (level * 100 / scale) else -1
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                       status == BatteryManager.BATTERY_STATUS_FULL
        return mapOf(
            "level"       to pct,
            "charging"    to charging,
            "temperature" to temp,
        )
    }

    // ── Location ──────────────────────────────────────────────────────────────

    suspend fun location(params: JsonObject): Any {
        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED &&
            context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            throw SecurityException("Location permission not granted — request ACCESS_FINE_LOCATION in app settings")
        }

        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

        // Try last known from GPS or network provider
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        for (provider in providers) {
            if (!lm.isProviderEnabled(provider)) continue
            @Suppress("MissingPermission")
            val loc = lm.getLastKnownLocation(provider) ?: continue
            return mapOf(
                "latitude"  to loc.latitude,
                "longitude" to loc.longitude,
                "accuracy"  to loc.accuracy,
                "provider"  to provider,
            )
        }
        throw IllegalStateException("Location unavailable — check GPS permission and that location is enabled")
    }

    // ── Network ───────────────────────────────────────────────────────────────

    suspend fun network(params: JsonObject): Any {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork
        val caps = if (network != null) cm.getNetworkCapabilities(network) else null

        val hasWifi   = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        val hasMobile = caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true
        val connected = caps != null

        val result = mutableMapOf<String, Any?>(
            "connected" to connected,
            "wifi"      to hasWifi,
            "mobile"    to hasMobile,
        )

        if (hasWifi) {
            @Suppress("DEPRECATION")
            val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            val info = wm.connectionInfo
            result["ssid"] = info?.ssid?.removePrefix("\"")?.removeSuffix("\"")
        }

        return result
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    suspend fun storage(params: JsonObject): Any {
        val stat = StatFs(Environment.getDataDirectory().path)
        val total = stat.totalBytes
        val free  = stat.availableBytes
        val used  = total - free
        return mapOf(
            "total" to total,
            "used"  to used,
            "free"  to free,
        )
    }

    // ── Screen State ──────────────────────────────────────────────────────────

    suspend fun screenState(params: JsonObject): Any {
        val pm = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        val isOn = pm.isInteractive
        val km = context.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
        val isLocked = km.isKeyguardLocked
        return mapOf(
            "on"     to isOn,
            "locked" to isLocked,
        )
    }
}
