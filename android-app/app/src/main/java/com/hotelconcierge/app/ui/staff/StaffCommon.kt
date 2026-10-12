package com.hotelconcierge.app.ui.staff

import android.widget.Toast
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Live
import com.hotelconcierge.app.ui.theme.HC

/** Page title row used by every staff screen. */
@Composable
fun StaffHeader(title: String, subtitle: String? = null, onBack: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(start = if (onBack != null) 4.dp else 18.dp, end = 12.dp, top = 12.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.headlineSmall)
            if (subtitle != null) Text(subtitle, color = HC.Muted, style = MaterialTheme.typography.bodySmall)
        }
        actions()
    }
}

/** Runs [action] whenever one of these live events (or a reconnect) arrives. */
@Composable
fun OnLive(vararg names: String, action: suspend () -> Unit) {
    val latest by rememberUpdatedState(action)
    val set = names.toSet() + "connect"
    LaunchedEffect(Unit) { Live.events.collect { if (it.name in set) latest() } }
}

@Composable
fun rememberToast(): (String) -> Unit {
    val context = LocalContext.current
    return { text -> Toast.makeText(context, text, Toast.LENGTH_SHORT).show() }
}

@Composable
fun ConfirmDialog(title: String, text: String, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { TextButton(onClick = { onDismiss(); onConfirm() }) { Text(confirm, color = HC.Maroon) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        containerColor = HC.Surface,
    )
}
