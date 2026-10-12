package com.hotelconcierge.app.ui.guest

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.GuestLoginResponse
import com.hotelconcierge.app.data.RoomInfo
import com.hotelconcierge.app.data.RoomLink
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.SessionStore
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.InfoText
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.theme.HC
import kotlinx.coroutines.launch

/** Guest step 2: Guest ID + 6-digit code from the welcome card. */
@Composable
fun GuestLoginScreen(link: RoomLink, onScanAgain: () -> Unit) {
    val scope = rememberCoroutineScope()
    var room by remember { mutableStateOf<RoomInfo?>(null) }
    var roomError by remember { mutableStateOf<String?>(null) }
    var guestId by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(link) {
        roomError = null
        runCatching {
            Api.json.decodeFromString<RoomInfo>(Api.call("GET", "/api/auth/room/${link.roomToken}", server = link.server, auth = false))
        }.onSuccess { room = it }.onFailure { roomError = it.message }
    }

    fun login() = scope.launch {
        busy = true
        error = null
        runCatching {
            val body = jsonOf("room" to link.roomToken, "guestId" to guestId.trim(), "code" to code)
            Api.json.decodeFromString<GuestLoginResponse>(Api.call("POST", "/api/auth/guest/login", body, server = link.server, auth = false))
        }.onSuccess { res ->
            SessionStore.save(
                Session.Guest(
                    server = link.server, token = res.token, roomToken = link.roomToken, name = res.guest.name,
                    roomNumber = res.guest.roomNumber, hotelName = room?.hotelName ?: res.guest.hotelName,
                ),
            )
        }.onFailure { error = it.message; busy = false }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        HcCard {
            Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(room?.hotelName ?: "Welcome", style = MaterialTheme.typography.displaySmall, textAlign = TextAlign.Center)
                Spacer(Modifier.height(10.dp))
                if (roomError != null) {
                    ErrorText(roomError)
                    Spacer(Modifier.height(12.dp))
                    PrimaryButton("Scan again", onClick = onScanAgain, icon = Icons.Outlined.QrCodeScanner, modifier = Modifier.fillMaxWidth())
                    return@Column
                }
                Text(
                    room?.let { "Room ${it.roomNumber}" } ?: "…",
                    color = HC.GreenDark,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.background(HC.GreenSoft, CircleShape).padding(horizontal = 14.dp, vertical = 5.dp),
                )
                Spacer(Modifier.height(14.dp))
                Text("Welcome to your stay", style = MaterialTheme.typography.headlineSmall)
                Text("Enter the Guest ID and access code from your welcome card.", color = HC.Muted, textAlign = TextAlign.Center)
                Spacer(Modifier.height(18.dp))
                SessionStore.notice?.let { InfoText(it); Spacer(Modifier.height(12.dp)) }
                Field(guestId, { guestId = it }, "Guest ID", placeholder = "e.g. Ranchi")
                Spacer(Modifier.height(12.dp))
                Field(
                    code, { v -> code = v.filter(Char::isDigit).take(6) }, "Access code",
                    keyboardType = KeyboardType.NumberPassword, placeholder = "6 digits",
                    onDone = { if (room != null && guestId.isNotBlank() && code.length == 6 && !busy) login() },
                )
                Spacer(Modifier.height(12.dp))
                ErrorText(error)
                Spacer(Modifier.height(12.dp))
                PrimaryButton(
                    "Enter", onClick = { login() }, icon = Icons.Outlined.Key, loading = busy,
                    enabled = room != null && guestId.isNotBlank() && code.length == 6,
                    modifier = Modifier.fillMaxWidth(),
                )
                TextButton(onClick = onScanAgain) { Text("Scan a different QR code", color = HC.Muted) }
            }
        }
    }
}
