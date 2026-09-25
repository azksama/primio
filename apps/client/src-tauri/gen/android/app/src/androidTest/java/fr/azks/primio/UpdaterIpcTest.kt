package fr.azks.primio

import android.content.Intent
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class UpdaterIpcTest {
    @Test fun updaterCommandsReturnThroughTheRealWebViewBridge() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val activity = instrumentation.startActivitySync(
            Intent().setClassName(context, "fr.azks.primio.MainActivity")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        fun findWebView(view: View): WebView? {
            if (view is WebView) return view
            if (view is ViewGroup) for (index in 0 until view.childCount) {
                findWebView(view.getChildAt(index))?.let { return it }
            }
            return null
        }
        val webView = AtomicReference<WebView>()
        instrumentation.runOnMainSync {
            webView.set(findWebView(activity.window.decorView))
        }
        assertNotNull("MainActivity WebView", webView.get())
        fun evaluate(script: String): String {
            val result = AtomicReference<String>()
            val latch = CountDownLatch(1)
            instrumentation.runOnMainSync {
                webView.get().evaluateJavascript(script) { value -> result.set(value); latch.countDown() }
            }
            assertTrue("WebView callback timed out", latch.await(5, TimeUnit.SECONDS))
            return result.get()
        }
        fun awaitValue(script: String, expected: String, timeout: Long = 20000) {
            val deadline = SystemClock.elapsedRealtime() + timeout
            while (SystemClock.elapsedRealtime() < deadline) {
                if (evaluate(script) == expected) return
                SystemClock.sleep(100)
            }
            fail("Expected $expected; got ${evaluate(script)}")
        }
        try {
            awaitValue("Boolean(window.__TAURI_INTERNALS__?.invoke)", "true")
            assertTrue("Use an empty update cache", java.io.File(context.cacheDir, "updates").listFiles().isNullOrEmpty())
            evaluate("window.__updaterProbe = 'pending'; window.__TAURI_INTERNALS__.invoke('update_check').then(value => window.__updaterProbe = value === null ? 'current' : 'update-available', e => window.__updaterProbe = String(e));")
            awaitValue("window.__updaterProbe", "\"current\"", 45000)
            // Current release and an empty update cache: no installer or download is requested.
            // Both calls still construct and move the full command future through Android IPC.
            evaluate("window.__updaterProbe = 'pending'; window.__TAURI_INTERNALS__.invoke('update_download').then(() => window.__updaterProbe = 'unexpected-download', e => window.__updaterProbe = String(e));")
            awaitValue("window.__updaterProbe", "\"No update available\"", 45000)
            evaluate("window.__updaterProbe = 'pending'; window.__TAURI_INTERNALS__.invoke('update_install').then(() => window.__updaterProbe = 'unexpected-install', e => window.__updaterProbe = String(e));")
            awaitValue("window.__updaterProbe", "\"Download the update first\"")
            assertFalse(activity.isFinishing)
        } finally {
            evaluate("delete window.__updaterProbe")
            instrumentation.runOnMainSync { activity.finish() }
        }
    }
}
