package com.hotelconcierge.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.hotelconcierge.app.data.RoomLink
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.SessionStore
import com.hotelconcierge.app.ui.guest.GuestHome
import com.hotelconcierge.app.ui.guest.GuestLoginScreen
import com.hotelconcierge.app.ui.guest.ScanScreen
import com.hotelconcierge.app.ui.staff.StaffHome
import com.hotelconcierge.app.ui.staff.StaffLoginScreen
import com.hotelconcierge.app.ui.start.StartScreen
import com.hotelconcierge.app.ui.theme.HC

private sealed interface Entry {
    data object Start : Entry
    data object Scan : Entry
    data class GuestLogin(val link: RoomLink) : Entry
    data object StaffLogin : Entry
}

/** Shows the guest app, the staff app, or the way in (scan / staff login). */
@Composable
fun AppRoot(openedLink: RoomLink?, onLinkUsed: () -> Unit) {
    val session by SessionStore.session.collectAsState()
    var entry by remember { mutableStateOf<Entry>(Entry.Start) }

    LaunchedEffect(openedLink, session) {
        if (openedLink != null && session == null) entry = Entry.GuestLogin(openedLink)
        if (openedLink != null) onLinkUsed()
    }

    Box(Modifier.fillMaxSize().background(HC.Bg).windowInsetsPadding(WindowInsets.safeDrawing)) {
        when (val s = session) {
            is Session.Guest -> GuestHome(s)
            is Session.Staff -> StaffHome(s)
            null -> {
                BackHandler(enabled = entry != Entry.Start) { entry = Entry.Start }
                when (val e = entry) {
                    Entry.Start -> StartScreen(onGuest = { entry = Entry.Scan }, onStaff = { entry = Entry.StaffLogin })
                    Entry.Scan -> ScanScreen(onBack = { entry = Entry.Start }, onFound = { entry = Entry.GuestLogin(it) })
                    is Entry.GuestLogin -> GuestLoginScreen(e.link, onScanAgain = { entry = Entry.Scan })
                    Entry.StaffLogin -> StaffLoginScreen(onBack = { entry = Entry.Start })
                }
            }
        }
    }
}
