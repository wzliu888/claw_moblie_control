package com.clawpaw.phonecontrol

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Handles app management commands dispatched by [CommandDispatcher].
 */
class AppsHandler(private val context: Context) {

    // ── List Apps ─────────────────────────────────────────────────────────────

    suspend fun listApps(params: JsonObject): Any {
        val runningOnly = params.get("running")?.takeIf { !it.isJsonNull }?.asBoolean ?: false
        val pm = context.packageManager

        val apps = if (runningOnly) {
            // NOTE: On Android 7+, getRunningAppProcesses() only returns processes belonging
            // to the caller's app — it does NOT return processes from other apps.
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            @Suppress("DEPRECATION")
            am.runningAppProcesses?.map { proc ->
                mapOf(
                    "package" to proc.processName,
                    "pid"     to proc.pid,
                )
            } ?: emptyList()
        } else {
            pm.getInstalledApplications(PackageManager.GET_META_DATA)
                .filter { it.flags and ApplicationInfo.FLAG_SYSTEM == 0 } // user apps only
                .map { app ->
                    mapOf(
                        "package" to app.packageName,
                        "name"    to pm.getApplicationLabel(app).toString(),
                    )
                }
        }

        return mapOf("apps" to apps, "count" to apps.size)
    }

    // ── Launch App ────────────────────────────────────────────────────────────

    suspend fun launchApp(params: JsonObject): Any {
        val pkg = params.get("package")?.asString
            ?: throw IllegalArgumentException("package required")
        val intent = context.packageManager.getLaunchIntentForPackage(pkg)
            ?: throw IllegalArgumentException("No launch intent for package: $pkg")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return mapOf("package" to pkg, "launched" to true)
    }

    // ── Shell ─────────────────────────────────────────────────────────────────

    suspend fun shell(params: JsonObject): Any = withContext(Dispatchers.IO) {
        val command = params.get("command")?.asString
            ?: throw IllegalArgumentException("command required")

        val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", command))

        // Read stdout and stderr concurrently to prevent buffer-full deadlock
        val stdoutDeferred = async { process.inputStream.bufferedReader().readText() }
        val stderrDeferred = async { process.errorStream.bufferedReader().readText() }

        val exited = process.waitFor(30, TimeUnit.SECONDS)
        if (!exited) {
            process.destroyForcibly()
            throw RuntimeException("Command timed out after 30s: $command")
        }

        mapOf(
            "stdout"   to stdoutDeferred.await(),
            "stderr"   to stderrDeferred.await(),
            "exitCode" to process.exitValue(),
        )
    }
}
