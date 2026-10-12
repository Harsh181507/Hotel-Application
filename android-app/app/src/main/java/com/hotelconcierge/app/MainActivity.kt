package com.hotelconcierge.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import com.hotelconcierge.app.data.QrLink
import com.hotelconcierge.app.data.RoomLink
import com.hotelconcierge.app.ui.AppRoot
import com.hotelconcierge.app.ui.theme.HotelTheme

class MainActivity : ComponentActivity() {

    // A room link that opened the app (QR scanned with the phone's own camera).
    private val openedLink = mutableStateOf<RoomLink?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        openedLink.value = linkFrom(intent)
        setContent {
            HotelTheme {
                AppRoot(openedLink = openedLink.value, onLinkUsed = { openedLink.value = null })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        linkFrom(intent)?.let { openedLink.value = it }
    }

    private fun linkFrom(intent: Intent?): RoomLink? = intent?.dataString?.let { QrLink.parse(it) }
}
