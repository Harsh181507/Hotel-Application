package com.hotelconcierge.app.ui.staff

import android.content.Intent
import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DoNotDisturbOn
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.QrCode2
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.Bill
import com.hotelconcierge.app.data.CheckinResponse
import com.hotelconcierge.app.data.NewCodeResponse
import com.hotelconcierge.app.data.Room
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.HK_STATUS
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.SecondaryButton
import com.hotelconcierge.app.ui.common.SmallButton
import com.hotelconcierge.app.ui.common.StatusPill
import com.hotelconcierge.app.ui.common.Tone
import com.hotelconcierge.app.ui.rupees
import com.hotelconcierge.app.ui.theme.HC
import kotlinx.coroutines.launch

private data class Credentials(val guestId: String, val code: String, val room: Room)

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun RoomsScreen(session: Session.Staff, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var rooms by remember { mutableStateOf<List<Room>?>(null) }
    var checkinRoom by remember { mutableStateOf<Room?>(null) }
    var credentials by remember { mutableStateOf<Credentials?>(null) }
    var qrRoom by remember { mutableStateOf<Room?>(null) }
    var newCodeRoom by remember { mutableStateOf<Room?>(null) }
    var checkout by remember { mutableStateOf<Pair<Room, Bill?>?>(null) }
    var adding by remember { mutableStateOf(false) }

    suspend fun load() { rooms = runCatching { Api.get<List<Room>>("/api/staff/rooms") }.getOrDefault(rooms ?: emptyList()) }
    LaunchedEffect(Unit) { load() }
    OnLive("stay:updated", "room:updated") { load() }

    Column(Modifier.fillMaxSize()) {
        val list = rooms
        val free = list?.count { it.stay == null } ?: 0
        StaffHeader("Rooms", list?.let { "${it.size - free} occupied · $free free" }, onBack = onBack) {
            if (session.isAdmin) SecondaryButton("Add", { adding = true }, icon = Icons.Outlined.Add)
        }
        if (list == null) return@Column Loading()
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(list, key = { it.id }) { room ->
                HcCard(border = if (room.stay != null) HC.Green.copy(alpha = 0.4f) else HC.Border) {
                    Column(Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(room.number, fontFamily = FontFamily.Serif, fontSize = 26.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            StatusPill(if (room.stay != null) "Occupied" else "Free", if (room.stay != null) Tone.Green else Tone.Grey)
                        }
                        if (room.hkStatus != "ready" || room.dnd) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
                                HK_STATUS[room.hkStatus]?.takeIf { room.hkStatus != "ready" }?.let { (l, t) -> StatusPill(l, t) }
                                if (room.dnd) StatusPill("DND", Tone.Grey, Icons.Outlined.DoNotDisturbOn)
                            }
                        }
                        room.stay?.let { s ->
                            Text(s.guestName, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 6.dp))
                            Text("Guest ID: ${s.guestLogin}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                        } ?: Text("No guest", color = HC.Muted, modifier = Modifier.padding(top = 6.dp))
                        Spacer(Modifier.height(10.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (room.stay != null) {
                                SmallButton("New code", { newCodeRoom = room }, Icons.Outlined.Key)
                                SmallButton("Check out", {
                                    scope.launch {
                                        val bill = runCatching { Api.get<Bill>("/api/staff/stays/${room.stay.id}/bill") }.getOrNull()
                                        checkout = room to bill
                                    }
                                }, Icons.AutoMirrored.Outlined.Logout)
                            } else {
                                SmallButton("Check in", { checkinRoom = room }, Icons.Outlined.PersonAdd, primary = true)
                            }
                            SmallButton("QR", { qrRoom = room }, Icons.Outlined.QrCode2)
                        }
                    }
                }
            }
        }
    }

    checkinRoom?.let { room ->
        var name by remember(room.id) { mutableStateOf("") }
        var login by remember(room.id) { mutableStateOf("") }
        var error by remember(room.id) { mutableStateOf<String?>(null) }
        var busy by remember(room.id) { mutableStateOf(false) }
        fun suggest(n: String) = n.trim().split(Regex("\\s+")).first().filter { it.isLetterOrDigit() || it == '-' }.let { if (it.isEmpty()) "" else (it + room.number).filter { c -> c.isLetterOrDigit() || c == '-' }.take(32) }
        AlertDialog(
            onDismissRequest = { checkinRoom = null },
            title = { Text("Check in · Room ${room.number}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Field(name, { v -> if (login.isEmpty() || login == suggest(name)) login = suggest(v); name = v }, "Guest name", placeholder = "e.g. Om Sharma")
                    Field(login, { login = it.filter { c -> c.isLetterOrDigit() || c == '-' }.take(32) }, "Guest ID (guest types this + code)", supporting = "At least 3 letters, digits or dashes")
                    ErrorText(error)
                }
            },
            confirmButton = {
                TextButton(enabled = !busy && name.isNotBlank() && login.length >= 3, onClick = {
                    scope.launch {
                        busy = true
                        runCatching { Api.post<CheckinResponse>("/api/staff/rooms/${room.id}/checkin", jsonOf("guestName" to name.trim(), "guestLogin" to login)) }
                            .onSuccess { res -> checkinRoom = null; credentials = Credentials(res.guestId, res.code, room); load() }
                            .onFailure { error = it.message; busy = false }
                    }
                }) { Text("Check in & create code") }
            },
            dismissButton = { TextButton(onClick = { checkinRoom = null }) { Text("Cancel") } },
            containerColor = HC.Surface,
        )
    }

    credentials?.let { c ->
        AlertDialog(
            onDismissRequest = { credentials = null },
            title = { Text("Give these to the guest", color = HC.GreenDark) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Write them on the welcome card now. The code is stored hashed and cannot be shown again.", color = HC.Muted)
                    Text("GUEST ID", style = MaterialTheme.typography.labelMedium, color = HC.Muted)
                    Text(c.guestId, color = HC.Text, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth().background(HC.Input, RoundedCornerShape(12.dp)).padding(12.dp))
                    Text("ACCESS CODE", style = MaterialTheme.typography.labelMedium, color = HC.Muted)
                    Text(c.code, color = HC.Text, fontSize = 28.sp, letterSpacing = 8.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth().background(HC.Input, RoundedCornerShape(12.dp)).padding(12.dp))
                    Text("Room ${c.room.number} · they scan the room QR with the Hotel Concierge app (or the phone camera), then enter these two.", color = HC.Muted)
                }
            },
            confirmButton = { TextButton(onClick = { credentials = null }) { Text("Done") } },
            dismissButton = { TextButton(onClick = { qrRoom = c.room; credentials = null }) { Text("Show room QR") } },
            containerColor = HC.GreenSoft,
        )
    }

    newCodeRoom?.let { room ->
        ConfirmDialog("New code for room ${room.number}?", "The guest's phones will be logged out until they enter the new code.", "Create new code", {
            scope.launch {
                runCatching { Api.post<NewCodeResponse>("/api/staff/stays/${room.stay!!.id}/new-code") }
                    .onSuccess { credentials = Credentials(it.guestId, it.code, room) }
                    .onFailure { toast(it.message ?: "Failed") }
            }
        }, { newCodeRoom = null })
    }

    checkout?.let { (room, bill) ->
        val charged = bill?.orders?.count { it.status != "cancelled" } ?: 0
        val billText = if (bill != null && charged > 0) "\n\nRoom-service bill: ${rupees(bill.totalPaise)} ($charged order${if (charged > 1) "s" else ""}). Collect it before the guest leaves." else ""
        ConfirmDialog("Check out room ${room.number}?", "${room.stay?.guestName} will be logged out and the room goes to housekeeping.$billText", "Check out", {
            scope.launch {
                runCatching { Api.send("POST", "/api/staff/stays/${room.stay!!.id}/checkout") }
                    .onSuccess { toast("Room ${room.number} checked out"); load() }
                    .onFailure { toast(it.message ?: "Failed") }
            }
        }, { checkout = null })
    }

    qrRoom?.let { room -> QrDialog(room) { qrRoom = null } }

    if (adding) {
        var number by remember { mutableStateOf("") }
        var error by remember { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text("Add a room") },
            text = { Column { Field(number, { number = it.take(20) }, "Room number"); Spacer(Modifier.height(8.dp)); ErrorText(error) } },
            confirmButton = {
                TextButton(enabled = number.isNotBlank(), onClick = {
                    scope.launch {
                        runCatching { Api.send("POST", "/api/staff/rooms", jsonOf("number" to number.trim())) }
                            .onSuccess { adding = false; load() }
                            .onFailure { error = if ((it as? com.hotelconcierge.app.data.ApiException)?.status == 409) "That room number already exists" else it.message }
                    }
                }) { Text("Add room") }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("Cancel") } },
            containerColor = HC.Surface,
        )
    }
}

/** QR code made on the phone (no internet needed) from the room's permanent link. */
fun qrBitmap(text: String, size: Int = 720): Bitmap {
    val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, mapOf(EncodeHintType.MARGIN to 1))
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
    for (x in 0 until size) for (y in 0 until size) bitmap.setPixel(x, y, if (matrix[x, y]) 0xFF1F1A16.toInt() else 0xFFFFFFFF.toInt())
    return bitmap
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun QrDialog(room: Room, onClose: () -> Unit) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val bitmap = remember(room.link) { qrBitmap(room.link).asImageBitmap() }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Room ${room.number} · in-room QR") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.background(androidx.compose.ui.graphics.Color.White, RoundedCornerShape(18.dp)).padding(14.dp)) {
                    Image(bitmap, "QR code for room ${room.number}", Modifier.size(220.dp), filterQuality = FilterQuality.None)
                }
                Spacer(Modifier.height(10.dp))
                Text(room.link, color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(10.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SecondaryButton("Copy link", { clipboard.setText(AnnotatedString(room.link)) }, icon = Icons.Outlined.ContentCopy)
                    SecondaryButton("Share", {
                        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, room.link), "Room ${room.number} link"))
                    }, icon = Icons.Outlined.Share)
                }
                Spacer(Modifier.height(8.dp))
                Text("Print this and place it in the room. It never changes, even when guests or codes change.", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Done") } },
        containerColor = HC.Surface,
    )
}
