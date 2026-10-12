package com.hotelconcierge.app.ui.start

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.RoomService
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.SessionStore
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.InfoText
import com.hotelconcierge.app.ui.theme.HC

@Composable
fun StartScreen(onGuest: () -> Unit, onStaff: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(84.dp).clip(RoundedCornerShape(26.dp)).background(HC.Green), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.RoomService, null, tint = HC.Bg, modifier = Modifier.size(46.dp))
        }
        Spacer(Modifier.height(18.dp))
        Text("Hotel Concierge", style = MaterialTheme.typography.displaySmall, textAlign = TextAlign.Center)
        Text("Everything for your stay, in one place", color = HC.Muted, textAlign = TextAlign.Center)
        Spacer(Modifier.height(32.dp))
        SessionStore.notice?.let { InfoText(it); Spacer(Modifier.height(16.dp)) }
        Choice(
            icon = Icons.Outlined.QrCodeScanner,
            title = "I'm a guest",
            text = "Scan the QR code in your room",
            highlight = true,
            onClick = onGuest,
        )
        Spacer(Modifier.height(12.dp))
        Choice(
            icon = Icons.Outlined.RoomService,
            title = "Hotel staff",
            text = "Front desk, housekeeping, kitchen, maintenance",
            highlight = false,
            onClick = onStaff,
        )
    }
}

@Composable
private fun Choice(icon: ImageVector, title: String, text: String, highlight: Boolean, onClick: () -> Unit) {
    HcCard(Modifier.clip(RoundedCornerShape(18.dp)).clickable(onClick = onClick), border = if (highlight) HC.Green else HC.Border) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(if (highlight) HC.Green else HC.GreenSoft),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, null, tint = if (highlight) Color.White else HC.Green, modifier = Modifier.size(28.dp)) }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(text, color = HC.Muted, style = MaterialTheme.typography.bodyMedium)
            }
            Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, tint = HC.Muted)
        }
    }
}
