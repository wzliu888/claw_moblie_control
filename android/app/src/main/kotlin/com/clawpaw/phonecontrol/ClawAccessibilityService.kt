package com.clawpaw.phonecontrol

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import androidx.annotation.RequiresApi
import java.io.ByteArrayOutputStream
import java.util.Base64
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

private const val TAG = "ClawA11yService"

/**
 * Accessibility Service — required for:
 *  - takeScreenshot (API 28+)
 *  - UI element tree traversal (snapshot)
 *  - Gesture injection (tap, swipe, etc.)
 *
 * Must be enabled in: Settings → Accessibility → ClawPaw
 */
class ClawAccessibilityService : AccessibilityService() {

    companion object {
        /** Singleton reference set when service connects, cleared on disconnect. */
        @Volatile
        var instance: ClawAccessibilityService? = null
            private set
    }

    override fun onServiceConnected() {
        instance = this
        // Re-apply flags at runtime to ensure window retrieval works
        serviceInfo = serviceInfo?.also { info ->
            info.flags = info.flags or
                android.accessibilityservice.AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            info.eventTypes = android.view.accessibility.AccessibilityEvent.TYPES_ALL_MASK
            info.feedbackType = android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_GENERIC
            info.notificationTimeout = 100
        }
        Log.i(TAG, "AccessibilityService connected, flags=${serviceInfo?.flags}")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* not needed */ }

    override fun onInterrupt() { /* not needed */ }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    // ── Screenshot ────────────────────────────────────────────────────────────

    /**
     * Takes a screenshot, compresses to JPEG, and returns Base64-encoded string.
     * @param maxWidth  scale down to this width (keeps aspect ratio). Default 1080.
     * @param quality   JPEG quality 0-100. Default 60.
     */
    @RequiresApi(Build.VERSION_CODES.P)
    suspend fun screenshotBase64(maxWidth: Int = 1080, quality: Int = 60): String =
        suspendCancellableCoroutine { cont ->
            takeScreenshot(
                Display.DEFAULT_DISPLAY,
                mainExecutor,
                object : TakeScreenshotCallback {
                    override fun onSuccess(result: ScreenshotResult) {
                        try {
                            val hwBitmap = Bitmap.wrapHardwareBuffer(
                                result.hardwareBuffer, result.colorSpace
                            ) ?: throw IllegalStateException("null bitmap from screenshot")
                            result.hardwareBuffer.close()

                            // Copy to software bitmap for compression
                            val src = hwBitmap.copy(Bitmap.Config.ARGB_8888, false)
                            hwBitmap.recycle()

                            // Scale down if wider than maxWidth
                            val scaled = if (src.width > maxWidth) {
                                val ratio = maxWidth.toFloat() / src.width
                                val h = (src.height * ratio).toInt()
                                val s = Bitmap.createScaledBitmap(src, maxWidth, h, true)
                                src.recycle()
                                s
                            } else src

                            val baos = ByteArrayOutputStream()
                            scaled.compress(Bitmap.CompressFormat.JPEG, quality, baos)
                            scaled.recycle()

                            val b64 = Base64.getEncoder().encodeToString(baos.toByteArray())
                            cont.resume(b64)
                        } catch (e: Exception) {
                            cont.resumeWithException(e)
                        }
                    }

                    override fun onFailure(errorCode: Int) {
                        cont.resumeWithException(
                            RuntimeException("takeScreenshot failed, errorCode=$errorCode")
                        )
                    }
                }
            )
        }
}
