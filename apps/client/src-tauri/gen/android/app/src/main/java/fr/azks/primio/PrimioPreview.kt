package fr.azks.primio

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import android.util.LruCache
import android.widget.ImageView
import org.json.JSONObject
import java.io.File
import java.util.BitSet
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.ceil

/** One independent, low-priority decoder; it never seeks the playing mpv instance. */
class PrimioPreview(private val options: JSONObject, private val view: ImageView) {
    private val handler = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor { task ->
        Thread({
            Process.setThreadPriority(Process.THREAD_PRIORITY_LOWEST)
            task.run()
        }, "PrimioPreview").apply { isDaemon = true }
    }
    private val cache = object : LruCache<Int, Bitmap>(2 * 1024 * 1024) {
        override fun sizeOf(key: Int, value: Bitmap) = value.byteCount
    }
    private val directory = File(view.context.cacheDir, "previews/${UUID.randomUUID()}")
    private val remote = options.optString("url").let {
        it.startsWith("https://", ignoreCase = true) || it.startsWith("http://", ignoreCase = true)
    }
    private val power = view.context.getSystemService(PowerManager::class.java)
    private val ready = BitSet()
    private val failed = BitSet()
    private val pumpTask = Runnable { pump() }
    private var pending: Int? = null
    private var working = false
    @Volatile private var closed = false
    private var requested = -1
    private var seconds = 0
    private var preloadCursor = 0
    private var active = true
    private var suspended = true
    private var nextPreloadAt = 0L
    private var retryAt = 0L
    private var lastRequestedAt = 0L
    private var consecutiveFailures = 0
    private var retryPasses = 0
    // The following fields are accessed only by the worker.
    private var retriever: MediaMetadataRetriever? = null
    private var diskBytes = 0L
    private var generatedFrames = 0
    private var decodeMillis = 0L

    fun playbackState(duration: Double, loaded: Boolean, buffering: Boolean,
                      position: Double, bufferedUntil: Double) {
        if (closed) return
        seconds = if (duration.isFinite() && duration > 0) ceil(duration).toInt() else 0
        // Local files may expose only one second of demuxer cache. A remote file
        // already buffered through its end also needs no extra reserve.
        val warmingBuffer = remote && bufferedUntil > position &&
            bufferedUntil - position < minOf(12.0, (duration - position - 0.5).coerceAtLeast(0.0))
        val thermal = Build.VERSION.SDK_INT >= 29 &&
            power.currentThermalStatus >= PowerManager.THERMAL_STATUS_MODERATE
        suspended = !loaded || buffering || warmingBuffer || thermal || power.isPowerSaveMode
        pump()
    }

    fun setActive(value: Boolean) {
        active = value
        if (!value) handler.removeCallbacks(pumpTask) else pump()
    }

    fun show(time: Double) {
        if (closed || !time.isFinite()) return
        val key = time.coerceAtLeast(0.0).toInt().coerceAtMost((seconds - 1).coerceAtLeast(0))
        val changed = requested != key
        requested = key
        lastRequestedAt = SystemClock.uptimeMillis()
        cache.get(key)?.let { view.setImageBitmap(it); pending = null; return }
        if (changed) view.setImageDrawable(null)
        pending = key
        pump()
    }

    private fun pump() {
        if (working || closed || !active) return
        handler.removeCallbacks(pumpTask)
        val now = SystemClock.uptimeMillis()
        val demand = pending
        val cachedDemand = demand != null && ready[demand]
        if (!cachedDemand && suspended) return
        if (demand == null) {
            // Browsing the timeline has priority over sequential warming.
            if (now < nextPreloadAt || now - lastRequestedAt < 350) {
                handler.postDelayed(pumpTask, 350)
                return
            }
            if (consecutiveFailures >= 3 && now < retryAt) {
                handler.postDelayed(pumpTask, retryAt - now)
                return
            }
            while (preloadCursor < seconds && (ready[preloadCursor] || failed[preloadCursor])) preloadCursor++
            if (preloadCursor >= seconds) {
                if (failed.isEmpty || retryPasses >= 2) return
                if (now < retryAt) { handler.postDelayed(pumpTask, retryAt - now); return }
                preloadCursor = failed.nextSetBit(0)
                failed.clear()
                retryPasses++
            }
        } else if (failed[demand] && now < retryAt) {
            handler.postDelayed(pumpTask, retryAt - now)
            return
        }
        val key = demand ?: preloadCursor
        pending = null
        working = true
        worker.execute {
            var frame: Bitmap? = null
            var diskBlocked = false
            var persisted = false
            try {
                if (!closed) {
                    val file = File(directory, "$key.jpg")
                    if (file.isFile) {
                        frame = BitmapFactory.decodeFile(file.absolutePath)
                        persisted = frame != null
                    }
                    if (frame == null) {
                        // Leave headroom for the main player's media cache and the OS.
                        diskBlocked = diskBytes >= 256L * 1024 * 1024 || view.context.cacheDir.usableSpace < 256L * 1024 * 1024
                        if (!diskBlocked || demand != null) {
                            var decoder = retriever
                            if (decoder == null) {
                                decoder = MediaMetadataRetriever()
                                try {
                                    val headers = mutableMapOf<String, String>()
                                    options.optJSONObject("headers")?.let { h -> h.keys().forEach { headers[it] = h.optString(it) } }
                                    val url = options.optString("url")
                                    if (url.startsWith("/")) decoder.setDataSource(url) else decoder.setDataSource(url, headers)
                                    retriever = decoder
                                } catch (error: Exception) {
                                    try { decoder.release() } catch (_: Exception) {}
                                    throw error
                                }
                            }
                            val started = SystemClock.elapsedRealtime()
                            frame = extractFrame(decoder, key)
                            decodeMillis += SystemClock.elapsedRealtime() - started
                            if (frame != null) generatedFrames++
                            if (!closed && !diskBlocked && frame != null) {
                                directory.mkdirs()
                                val partial = File(directory, "$key.partial")
                                partial.outputStream().use { frame!!.compress(Bitmap.CompressFormat.JPEG, 75, it) }
                                if (closed) partial.delete()
                                else if (partial.renameTo(file)) { diskBytes += file.length(); persisted = true }
                                else partial.delete()
                            }
                        }
                    }
                }
            } catch (_: Exception) {
                // A failed source is retried with backoff, never on the UI thread.
                if (frame != null) diskBlocked = true
            }
            handler.post {
                working = false
                if (closed) { frame?.recycle(); return@post }
                val bitmap = frame
                if (bitmap != null) {
                    if (persisted) ready.set(key)
                    failed.clear(key)
                    if (pending == key) pending = null
                    consecutiveFailures = 0
                    cache.put(key, bitmap)
                    if (requested == key) view.setImageBitmap(bitmap)
                } else if (!diskBlocked) {
                    ready.clear(key)
                    failed.set(key)
                    consecutiveFailures++
                    retryAt = SystemClock.uptimeMillis() + 30_000
                }
                if (demand == null && !diskBlocked) preloadCursor = key + 1
                // At most two background frame requests per second, one at a time.
                nextPreloadAt = SystemClock.uptimeMillis() + if (diskBlocked) 30_000 else 500
                if (diskBlocked) handler.postDelayed(pumpTask, 30_000) else pump()
            }
        }
    }

    private fun extractFrame(decoder: MediaMetadataRetriever, key: Int): Bitmap? {
        if (Build.VERSION.SDK_INT >= 27) {
            return decoder.getScaledFrameAtTime(key * 1_000_000L,
                MediaMetadataRetriever.OPTION_CLOSEST, 240, 135)
        }
        // minSdk is 26; getScaledFrameAtTime was introduced in Android 8.1.
        val original = decoder.getFrameAtTime(key * 1_000_000L,
            MediaMetadataRetriever.OPTION_CLOSEST) ?: return null
        val scale = minOf(240.0 / original.width, 135.0 / original.height, 1.0)
        val frame = Bitmap.createScaledBitmap(original,
            (original.width * scale).toInt().coerceAtLeast(1),
            (original.height * scale).toInt().coerceAtLeast(1), true)
        if (frame !== original) original.recycle()
        return frame
    }

    fun hide() {
        pending = null
        requested = -1
        view.setImageDrawable(null)
    }

    fun close() {
        if (closed) return
        closed = true
        pending = null
        handler.removeCallbacks(pumpTask)
        view.setImageDrawable(null)
        cache.evictAll()
        // Release on the owning thread after an in-flight native decode returns.
        // Concurrent release() during getFrameAtTime() can crash Android codecs.
        worker.execute {
            try { retriever?.release() } catch (_: Exception) {}
            retriever = null
            if (BuildConfig.DEBUG) android.util.Log.d("PrimioPreview",
                "frames=$generatedFrames decodeMs=$decodeMillis jpegBytes=$diskBytes")
            directory.deleteRecursively()
        }
        worker.shutdown()
    }
}
