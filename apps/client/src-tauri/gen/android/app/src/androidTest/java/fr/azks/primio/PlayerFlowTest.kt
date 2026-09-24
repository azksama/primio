package fr.azks.primio

import android.app.Activity
import android.content.Intent
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.inspector.WindowInspector
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class PlayerFlowTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private var activity: Activity? = null
    private var previousJournal: String? = null
    private var previousLanguage: String? = null

    @Before fun prepare() {
        previousLanguage = context.getSharedPreferences("primio-settings",0).getString("language",null)
        context.getSharedPreferences("primio-settings",0).edit().putString("language","fr").commit()
        System.loadLibrary("primio_lib")
        previousJournal = PrimioStore.read(context, "playerProgress")
        PrimioStore.write(context, "playerProgress", "{}")
    }

    @After fun restore() {
        activity?.let { current -> instrumentation.runOnMainSync { current.finish() } }
        instrumentation.waitForIdleSync()
        PrimioStore.write(context, "playerProgress", previousJournal ?: "{}")
        context.getSharedPreferences("primio-settings",0).edit().putString("language",previousLanguage).commit()
    }

    private fun start(position: Double = 0.0, automatic: Boolean = false, outro: Boolean = false, next: Boolean = true, multiTrack: Boolean = false, externalUrl: String = "", forceStyle: Boolean = false) {
        val file = File(context.getExternalFilesDir(null), if(multiTrack) "validation.mkv" else "validation.mp4")
        assertTrue("Run scripts/test-android-player.ps1 to install the video fixture", file.isFile)
        val episodes = JSONArray().put(JSONObject().put("id", "qa:1").put("title", "Premier épisode").put("season", 1).put("episode", 1))
            .put(JSONObject().put("id", "qa:2").put("title", "Deuxième épisode").put("season", 1).put("episode", 2))
        val options = JSONObject().put("url", file.absolutePath).put("offline", true).put("title", "Validation du lecteur")
            .put("position", position).put("hardwareDecoding", false).put("cacheSizeGb", 0).put("reduceMotion", true)
            .put("subtitleFont", "serif").put("subtitleColor", "#F5DE93").put("subtitleOutline", 3).put("subtitleBackground", true)
            .put("episodes", episodes).put("currentVideoId", "qa:1").put("nextVideoId", if (next) "qa:2" else "")
            .put("autoNextEpisode", automatic).put("forceSubtitleStyle", forceStyle)
            .put("context", JSONObject().put("videoId", "qa:1").put("profileId", "qa"))
        if(externalUrl.isNotBlank()) options.put("subtitles",JSONArray().put(JSONObject().put("url",externalUrl).put("lang","jpn")))
        if (outro) options.put("skipSegments", JSONArray().put(JSONObject().put("start", 10).put("end", 20).put("kind", "outro")))
        activity = instrumentation.startActivitySync(Intent(context, PlayerActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("options", options.toString()))
    }

    private fun views(): List<View> {
        val found = mutableListOf<View>()
        fun visit(view: View) {
            if (view.isShown) found.add(view)
            if (view is ViewGroup) for (i in 0 until view.childCount) visit(view.getChildAt(i))
        }
        instrumentation.runOnMainSync { WindowInspector.getGlobalWindowViews().forEach(::visit) }
        return found
    }
    private fun find(label: String) = views().firstOrNull { it.contentDescription?.toString() == label || (it as? TextView)?.text?.toString() == label }
    private fun waitUntil(message: String, timeout: Long = 12000, predicate: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + timeout
        while (SystemClock.elapsedRealtime() < deadline) {
            if (predicate()) return
            SystemClock.sleep(100)
        }
        fail(message)
    }
    private fun click(label: String) {
        waitUntil("Missing visible control: $label") { find(label) != null }
        val target = find(label)!!
        instrumentation.runOnMainSync { assertTrue(target.performClick()) }
    }
    private fun capture(name: String) {
        instrumentation.waitForIdleSync()
        SystemClock.sleep(350) // Allow the dialog/window transition to render before capture.
        val bitmap = instrumentation.uiAutomation.takeScreenshot() ?: return
        File(context.getExternalFilesDir(null), "$name.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
    private fun journal() = JSONObject(PrimioStore.read(context, "playerProgress") ?: "{}")
    private fun waitForNext() = waitUntil("No next episode request") { journal().optString("requestedVideoId") == "qa:2" }

    @Test fun episodeDrawerAndAudioPlacement() {
        start()
        waitUntil("Player did not load") { find("Audio et sous-titres") != null }
        val audio = find("Audio et sous-titres")!!
        val point = IntArray(2)
        instrumentation.runOnMainSync { audio.getLocationOnScreen(point) }
        assertTrue("Audio must be on the right", point[0] > context.resources.displayMetrics.widthPixels / 2)
        assertTrue("Audio must be at the bottom", point[1] > context.resources.displayMetrics.heightPixels / 2)
        click("Lecture ou pause")
        capture("native-player")
        click("Choisir un épisode")
        waitUntil("Episode drawer did not open") { find("2. Deuxième épisode") != null }
        capture("native-episodes")
        assertNull("One season must not have a selector", find("Saison 1  ⌄"))
        click("2. Deuxième épisode")
        waitForNext()
        assertFalse("Manual episode selection must open sources", journal().getBoolean("autoPlay"))
    }

    @Test fun offersNextInFinalThirtySecondsWithoutAutoSkipping() {
        start()
        waitUntil("No final thirty-second proposal") { find("Épisode suivant") != null }
        assertEquals("A proposal must not change the episode", "", journal().optString("requestedVideoId"))
        assertFalse(activity!!.isFinishing)
        capture("native-next-episode")
        click("Épisode suivant")
        waitForNext()
        assertTrue(journal().getBoolean("autoPlay"))
        assertEquals(journal().getDouble("duration"), journal().getDouble("position"), .1)
    }

    @Test fun outroAutomaticallyRequestsNextEpisode() {
        start(position = 8.0, automatic = true, outro = true)
        waitForNext()
        assertTrue(journal().getBoolean("autoPlay"))
        assertTrue(activity!!.isFinishing)
    }

    @Test fun endOfFileAutomaticallyRequestsNextEpisode() {
        start(position = 31.0, automatic = true)
        waitForNext()
        assertTrue(journal().getBoolean("autoPlay"))
    }

    @Test fun finalEpisodeDoesNotOfferANonexistentSuccessor() {
        start(position = 30.0, automatic = true, next = false)
        waitUntil("Final episode did not finish") { activity!!.isFinishing }
        assertEquals("", journal().optString("requestedVideoId"))
    }
    private fun playerState():JSONObject {
        var result=JSONObject()
        instrumentation.runOnMainSync {
            val field=PlayerActivity::class.java.getDeclaredField("last").apply{isAccessible=true}
            result=JSONObject((field.get(activity) as JSONObject).toString())
        }
        return result
    }
    private fun playerHandle():Long {
        var result=0L
        instrumentation.runOnMainSync {result=PlayerActivity::class.java.getDeclaredField("handle").apply{isAccessible=true}.getLong(activity)}
        return result
    }
    private fun selectedTrack(type:String,title:String)=playerState().optJSONArray("tracks")?.let{tracks->
        (0 until tracks.length()).map{tracks.getJSONObject(it)}.any{it.optString("type")==type&&it.optString("title")==title&&it.optBoolean("selected")}
    }?:false
    private fun chooseTrack(title:String){
        click("Audio et sous-titres")
        waitUntil("Missing track $title"){views().any{it.contentDescription?.contains(title)==true}}
        val view=views().first{it.contentDescription?.contains(title)==true}
        instrumentation.runOnMainSync{assertTrue(view.performClick())}
    }
    @Test fun subtitleStyleCanBeOverriddenWithoutReloading() {
        start(position=8.0,next=false,multiTrack=true,forceStyle=true)
        waitUntil("Player did not load"){find("Lecture ou pause")!=null}
        click("Lecture ou pause")
        waitUntil("Player did not pause"){playerState().optBoolean("paused")}
        assertEquals("force",playerState().optString("subtitleStyle"))
        val handle=playerHandle();val position=playerState().getDouble("position")
        for((label,mode) in listOf("Style intégré" to "no","Style Primio" to "force")){
            click("Audio et sous-titres")
            val target=find(label)!!
            val settings = find("Réglages du style")!!
            instrumentation.runOnMainSync {
                val sheet = target.rootView
                val location = IntArray(2)
                sheet.getLocationOnScreen(location)
                val bounds = activity!!.windowManager.currentWindowMetrics.bounds
                assertTrue("Sheet must stay inside the left player edge", location[0] >= bounds.left)
                assertTrue("Sheet must stay inside the right player edge", location[0] + sheet.width <= bounds.right)
                assertTrue("Sheet must stay inside the bottom player edge", location[1] + sheet.height <= bounds.bottom)
                val stylePosition = IntArray(2)
                val settingsPosition = IntArray(2)
                target.getLocationOnScreen(stylePosition)
                settings.getLocationOnScreen(settingsPosition)
                assertTrue("Style settings need a visible gap", settingsPosition[1] - stylePosition[1] - target.height >= PrimioStyle.dp(context, 16))
            }
            capture("native-audio-sheet")
            instrumentation.runOnMainSync { target.requestRectangleOnScreen(android.graphics.Rect(0,0,target.width,target.height),true) }
            click(label)
            waitUntil("Style did not apply"){playerState().optString("subtitleStyle")==mode}
            assertEquals(handle,playerHandle())
            assertEquals(position,playerState().getDouble("position"),.5)
        }
        capture("native-style-override")
    }
    @Test fun expiresOnlyUnwatchedCompletedDownloadsInTheRightProfile() {
        val prefs=context.getSharedPreferences("primio-downloads",0)
        val originalItems=prefs.getString("items",null)
        val originalPolicies=PrimioStore.read(context,"downloadPolicies")
        val manager=context.getSystemService(android.content.Context.DOWNLOAD_SERVICE) as android.app.DownloadManager
        val root=context.getExternalFilesDir(android.os.Environment.DIRECTORY_MOVIES)!!
        val ids=mutableListOf<Long>();val files=mutableListOf<File>()
        val items=JSONObject();val now=System.currentTimeMillis()
        fun item(age:Long,watched:Boolean=false,profile:String="qa",playing:Boolean=false):String{
            val id=java.util.UUID.randomUUID().toString();val file=File(root,"$id.media");File(context.getExternalFilesDir(null),"validation.mp4").copyTo(file);files.add(file)
            @Suppress("DEPRECATION") val downloadId=manager.addCompletedDownload("QA cleanup","QA cleanup",false,"video/mp4",file.absolutePath,file.length(),true)
            ids.add(downloadId)
            items.put(id,JSONObject().put("id",id).put("downloadId",downloadId).put("completedAt",now-age).put("watched",watched).put("meta",JSONObject().put("accountId","qa").put("profileId",profile).put("videoId",id).put("meta",JSONObject().put("type","movie"))))
            if(playing)DownloadStore.playingId=id
            return id
        }
        try{
            val expired=item(8*86400000L);val seen=item(8*86400000L,true);val recent=item(86400000L);val other=item(8*86400000L,profile="other");val playing=item(8*86400000L,playing=true)
            prefs.edit().putString("items",items.toString()).commit()
            PrimioStore.write(context,"downloadPolicies",JSONObject().put("qa",JSONArray().put(JSONObject().put("id","qa").put("days",7))).toString())
            val remaining=DownloadStore(context).list();val keys=(0 until remaining.length()).map{remaining.getJSONObject(it).getString("id")}
            assertFalse(keys.contains(expired));assertFalse(File(root,"$expired.media").exists())
            assertTrue(keys.containsAll(listOf(seen,recent,other,playing)))
            assertFalse(DownloadStore.shouldExpire("downloading",now-8*86400000L,7,false,false,now))
            assertFalse(DownloadStore.shouldExpire("complete",now-8*86400000L,0,false,false,now))
        }finally{
            DownloadStore.playingId="";ids.forEach{manager.remove(it)};files.forEach{it.delete()}
            prefs.edit().putString("items",originalItems).commit();PrimioStore.write(context,"downloadPolicies",originalPolicies?:"{}")
        }
    }

    @Test fun audioAndSubtitlesPreserveTheMediaAndPosition() {
        val server=java.net.ServerSocket(0,4,java.net.InetAddress.getByName("127.0.0.1"))
        val requests=java.util.concurrent.atomic.AtomicInteger()
        val body="1\n00:00:00,000 --> 00:00:32,000\nPrimio external subtitle\n".toByteArray()
        val thread=Thread {
            try {while(!server.isClosed){server.accept().use{socket->
                val reader=socket.getInputStream().bufferedReader();while(!reader.readLine().isNullOrEmpty()){}
                requests.incrementAndGet()
                socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/x-subrip\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n").toByteArray()+body)
            }}}catch(_:java.io.IOException){}
        }.apply{isDaemon=true;start()}
        try {
            start(position=8.0,next=false,multiTrack=true,externalUrl="http://127.0.0.1:${server.localPort}/sub.srt")
            waitUntil("Player did not load"){find("Lecture ou pause")!=null}
            click("Lecture ou pause")
            waitUntil("Player did not pause"){playerState().optBoolean("paused")}
            val handle=playerHandle();val position=playerState().getDouble("position")
            assertEquals("Embedded subtitle style must be the default","no",playerState().optString("subtitleStyle"))
            assertEquals("External subtitles must load on demand",0,requests.get())
            chooseTrack("QA Audio French")
            waitUntil("Audio did not switch"){selectedTrack("audio","QA Audio French")}
            chooseTrack("QA Subtitle French")
            waitUntil("Subtitle did not switch"){selectedTrack("sub","QA Subtitle French")}
            chooseTrack("Japonais")
            waitUntil("External subtitle did not load"){requests.get()>0&&selectedTrack("sub","jpn")}
            val loadedRequests=requests.get()
            click("Audio et sous-titres");click("Désactivés")
            chooseTrack("Japonais")
            waitUntil("External subtitle did not reselect"){selectedTrack("sub","jpn")}
            assertEquals("Do not download an already loaded subtitle again",loadedRequests,requests.get())
            assertEquals("Do not replace the mpv instance",handle,playerHandle())
            assertEquals("Track changes must preserve playback position",position,playerState().getDouble("position"),.5)
            capture("native-track-switch")
        }finally{server.close();thread.join(1000)}
    }

    @Test fun localNotificationsDeliverOnceAndIgnoreFutureEpisodes() {
        assertTrue("Grant notification permission before this test",PrimioNotifications.allowed(context))
        val previous=PrimioStore.read(context,"notificationConfig")
        val manager=context.getSystemService(android.app.NotificationManager::class.java)
        val now=System.currentTimeMillis();val scope="qa-$now"
        val entries=JSONArray()
            .put(JSONObject().put("id","released").put("title",scope).put("body","New episode").put("at",now-1000))
            .put(JSONObject().put("id","future").put("title",scope+"-future").put("body","Later episode").put("at",now+86400000))
        val config=JSONObject().put("scope",scope).put("episodes",true).put("updates",false).put("since",now-2000).put("entries",entries)
        try {
            PrimioNotifications.configure(context,config.toString())
            waitUntil("Local notification was not delivered",20000){manager.activeNotifications.any{it.notification.extras.getString("android.title")==scope}}
            val first=manager.activeNotifications.single{it.notification.extras.getString("android.title")==scope}
            waitUntil("Worker did not finish"){androidx.work.WorkManager.getInstance(context).getWorkInfosForUniqueWork("primio-notifications-now").get().let{it.isNotEmpty()&&it.all{w->w.state.isFinished}}}
            PrimioNotifications.configure(context,config.toString())
            waitUntil("Second worker did not finish"){androidx.work.WorkManager.getInstance(context).getWorkInfosForUniqueWork("primio-notifications-now").get().let{it.isNotEmpty()&&it.all{w->w.state.isFinished}}}
            assertEquals("Do not post future releases",1,manager.activeNotifications.count{it.notification.extras.getString("android.title")?.startsWith(scope)==true})
            assertEquals("Do not repost the same episode",first.postTime,manager.activeNotifications.single{it.id==first.id}.postTime)
            manager.cancel(first.id)
        }finally{
            PrimioNotifications.configure(context,previous?:JSONObject().put("episodes",false).put("updates",false).toString())
            val seen=context.getSharedPreferences("primio-notification-seen",0)
            val id=java.security.MessageDigest.getInstance("SHA-256").digest("$scope:released".toByteArray()).joinToString(""){"%02x".format(it)}
            seen.edit().remove(id).commit()
        }
    }

}
