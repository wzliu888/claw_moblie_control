package com.clawpaw.phonecontrol

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import com.google.gson.JsonObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

private const val TAG = "UiHandler"

/**
 * Handles UI-related commands dispatched by [CommandDispatcher].
 * Requires [ClawAccessibilityService] to be enabled.
 */
class UiHandler {

    private fun svc() = ClawAccessibilityService.instance
        ?: throw IllegalStateException("AccessibilityService not connected — enable ClawPaw in Accessibility settings")

    // ── Screenshot ────────────────────────────────────────────────────────────

    suspend fun screenshot(params: JsonObject): Any {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            throw UnsupportedOperationException("screenshot requires Android 9+ (API 28)")
        }
        val maxWidth = params.get("maxWidth")?.takeIf { !it.isJsonNull }?.asInt ?: 1080
        val quality  = params.get("quality")?.takeIf  { !it.isJsonNull }?.asInt ?: 60
        val b64 = svc().screenshotBase64(maxWidth, quality)
        return mapOf("data" to b64, "mimeType" to "image/jpeg")
    }

    // ── Snapshot (UI element tree) ────────────────────────────────────────────

    suspend fun snapshot(params: JsonObject): Any {
        val svc = svc()
        val nodes = mutableListOf<Map<String, Any?>>()
        val root = svc.rootInActiveWindow
            ?: return mapOf("nodes" to emptyList<Any>())
        collectNodes(root, nodes)
        root.recycle()
        return mapOf("nodes" to nodes)
    }

    private fun collectNodes(node: AccessibilityNodeInfo, out: MutableList<Map<String, Any?>>) {
        val bounds = android.graphics.Rect()
        node.getBoundsInScreen(bounds)
        out.add(mapOf(
            "text"        to (node.text?.toString() ?: node.contentDescription?.toString()),
            "id"          to node.viewIdResourceName,
            "className"   to node.className?.toString(),
            "x"           to bounds.centerX(),
            "y"           to bounds.centerY(),
            "left"        to bounds.left,
            "top"         to bounds.top,
            "right"       to bounds.right,
            "bottom"      to bounds.bottom,
            "clickable"   to node.isClickable,
            "scrollable"  to node.isScrollable,
            "editable"    to node.isEditable,
            "checked"     to node.isChecked,
            "enabled"     to node.isEnabled,
        ))
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                collectNodes(child, out)
                child.recycle()
            }
        }
    }

    // ── Tap ───────────────────────────────────────────────────────────────────

    suspend fun tap(params: JsonObject): Any {
        val x: Float
        val y: Float

        val textParam = params.get("text")?.takeIf { !it.isJsonNull }?.asString
        if (textParam != null) {
            val root = svc().rootInActiveWindow
                ?: throw IllegalStateException("No active window")
            val node = findNodeByText(root, textParam)
                ?: throw IllegalArgumentException("Element with text '$textParam' not found")
            val bounds = android.graphics.Rect()
            node.getBoundsInScreen(bounds)
            x = bounds.centerX().toFloat()
            y = bounds.centerY().toFloat()
            node.recycle()
            root.recycle()
        } else {
            x = params.get("x")?.asFloat ?: throw IllegalArgumentException("x or text required")
            y = params.get("y")?.asFloat ?: throw IllegalArgumentException("y or text required")
        }

        performTap(x, y, 50)
        return mapOf("x" to x, "y" to y)
    }

    private fun findNodeByText(node: AccessibilityNodeInfo, text: String): AccessibilityNodeInfo? {
        if (node.text?.toString()?.contains(text, ignoreCase = true) == true ||
            node.contentDescription?.toString()?.contains(text, ignoreCase = true) == true) {
            return AccessibilityNodeInfo.obtain(node)
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findNodeByText(child, text)
            child.recycle()
            if (found != null) return found
        }
        return null
    }

    // ── Long Press ────────────────────────────────────────────────────────────

    suspend fun longPress(params: JsonObject): Any {
        val x = params.get("x")?.asFloat ?: throw IllegalArgumentException("x required")
        val y = params.get("y")?.asFloat ?: throw IllegalArgumentException("y required")
        val duration = params.get("duration")?.takeIf { !it.isJsonNull }?.asLong ?: 1000L
        performTap(x, y, duration)
        return mapOf("x" to x, "y" to y, "duration" to duration)
    }

    // ── Swipe ─────────────────────────────────────────────────────────────────

    suspend fun swipe(params: JsonObject): Any {
        val duration = params.get("duration")?.takeIf { !it.isJsonNull }?.asLong ?: 300L
        val direction = params.get("direction")?.takeIf { !it.isJsonNull }?.asString
        val startX: Float; val startY: Float; val endX: Float; val endY: Float

        if (direction != null) {
            val root = svc().rootInActiveWindow
            val bounds = android.graphics.Rect()
            root?.getBoundsInScreen(bounds)
            root?.recycle()
            val w = bounds.width().takeIf { it > 0 } ?: 1080
            val h = bounds.height().takeIf { it > 0 } ?: 1920
            when (direction) {
                "up"    -> { startX = w / 2f; startY = h * 0.7f; endX = w / 2f; endY = h * 0.3f }
                "down"  -> { startX = w / 2f; startY = h * 0.3f; endX = w / 2f; endY = h * 0.7f }
                "left"  -> { startX = w * 0.8f; startY = h / 2f; endX = w * 0.2f; endY = h / 2f }
                "right" -> { startX = w * 0.2f; startY = h / 2f; endX = w * 0.8f; endY = h / 2f }
                else    -> throw IllegalArgumentException("Unknown direction: $direction")
            }
        } else {
            startX = params.get("startX")?.asFloat ?: throw IllegalArgumentException("startX required")
            startY = params.get("startY")?.asFloat ?: throw IllegalArgumentException("startY required")
            endX   = params.get("endX")?.asFloat   ?: throw IllegalArgumentException("endX required")
            endY   = params.get("endY")?.asFloat   ?: throw IllegalArgumentException("endY required")
        }

        performSwipe(startX, startY, endX, endY, duration)
        return mapOf("startX" to startX, "startY" to startY, "endX" to endX, "endY" to endY)
    }

    // ── Type Text ─────────────────────────────────────────────────────────────

    suspend fun typeText(params: JsonObject): Any {
        val text = params.get("text")?.asString ?: throw IllegalArgumentException("text required")
        val focus = svc().findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: throw IllegalStateException("No focused input field")
        val args = android.os.Bundle().apply {
            putString(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        focus.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        focus.recycle()
        return mapOf("text" to text)
    }

    // ── Press Key ─────────────────────────────────────────────────────────────

    suspend fun pressKey(params: JsonObject): Any {
        val key = params.get("key")?.asString ?: throw IllegalArgumentException("key required")
        val action = when (key.lowercase()) {
            "home"            -> AccessibilityService.GLOBAL_ACTION_HOME
            "back"            -> AccessibilityService.GLOBAL_ACTION_BACK
            "recents"         -> AccessibilityService.GLOBAL_ACTION_RECENTS
            "notifications"   -> AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS
            "quick_settings"  -> AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS
            "power_dialog"    -> AccessibilityService.GLOBAL_ACTION_POWER_DIALOG
            "lock_screen"     -> if (Build.VERSION.SDK_INT >= 28) AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN
                                 else throw UnsupportedOperationException("lock_screen requires API 28")
            "take_screenshot" -> if (Build.VERSION.SDK_INT >= 28) AccessibilityService.GLOBAL_ACTION_TAKE_SCREENSHOT
                                 else throw UnsupportedOperationException("take_screenshot requires API 28")
            else -> throw IllegalArgumentException("Unknown key: $key. Supported: home, back, recents, notifications, quick_settings, power_dialog, lock_screen")
        }
        svc().performGlobalAction(action)
        return mapOf("key" to key)
    }

    // ── Gesture helpers ───────────────────────────────────────────────────────

    private suspend fun performTap(x: Float, y: Float, durationMs: Long) =
        suspendCancellableCoroutine<Unit> { cont ->
            val path = Path().apply { moveTo(x, y) }
            val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
            val gesture = GestureDescription.Builder().addStroke(stroke).build()
            svc().dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription) = cont.resume(Unit)
                override fun onCancelled(gestureDescription: GestureDescription) =
                    cont.resumeWithException(RuntimeException("Gesture cancelled"))
            }, null)
        }

    private suspend fun performSwipe(sx: Float, sy: Float, ex: Float, ey: Float, durationMs: Long) =
        suspendCancellableCoroutine<Unit> { cont ->
            val path = Path().apply { moveTo(sx, sy); lineTo(ex, ey) }
            val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
            val gesture = GestureDescription.Builder().addStroke(stroke).build()
            svc().dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription) = cont.resume(Unit)
                override fun onCancelled(gestureDescription: GestureDescription) =
                    cont.resumeWithException(RuntimeException("Swipe cancelled"))
            }, null)
        }
}
