package com.hotelconcierge.app.ui.guest

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.Faq
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.SecondaryButton
import com.hotelconcierge.app.ui.common.SectionLabel
import com.hotelconcierge.app.ui.theme.HC

/** The hotel's answers (Wi-Fi, breakfast, nearby…). Loaded once, searched on the phone. */
@Composable
fun AnswersTab(onAskDesk: () -> Unit) {
    var faqs by remember { mutableStateOf<List<Faq>?>(null) }
    var query by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("All") }
    var open by remember { mutableStateOf<Int?>(null) }
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current

    LaunchedEffect(Unit) { faqs = runCatching { Api.get<List<Faq>>("/api/guest/faqs") }.getOrDefault(faqs ?: emptyList()) }

    val list = faqs ?: return Loading()
    val categories = listOf("All") + list.map { it.category }.distinct()
    val words = query.lowercase().split(Regex("\\s+")).filter { it.isNotBlank() }
    val visible = list.filter { f ->
        (category == "All" || f.category == category) &&
            "${f.question} ${f.answer} ${f.category}".lowercase().let { text -> words.all { it in text } }
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("How can we help?", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = query, onValueChange = { query = it },
                placeholder = { Text("Search Wi-Fi, breakfast, pharmacy…") },
                leadingIcon = { Icon(Icons.Outlined.Search, null) },
                singleLine = true, shape = RoundedCornerShape(28.dp), modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(focusedContainerColor = HC.Surface, unfocusedContainerColor = HC.Surface, focusedBorderColor = HC.Green, unfocusedBorderColor = HC.Border),
            )
            Spacer(Modifier.height(8.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(categories) { c -> HcChip(c, c == category, { category = c }) }
            }
        }
        if (visible.isEmpty()) item { Text("No answers found${if (query.isNotBlank()) " for “$query”" else ""}.", color = HC.Muted, modifier = Modifier.padding(16.dp)) }
        items(visible, key = { it.id }) { f ->
            val isOpen = open == f.id
            HcCard(Modifier.clip(RoundedCornerShape(18.dp)).clickable { open = if (isOpen) null else f.id }.animateContentSize()) {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            SectionLabel(f.category)
                            Text(f.question, style = MaterialTheme.typography.titleMedium)
                        }
                        Icon(if (isOpen) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null, tint = HC.Muted)
                    }
                    if (isOpen) {
                        Spacer(Modifier.height(10.dp))
                        Text(f.answer, style = MaterialTheme.typography.bodyLarge)
                        Spacer(Modifier.height(10.dp))
                        SecondaryButton("Copy", onClick = {
                            clipboard.setText(AnnotatedString(f.answer))
                            android.widget.Toast.makeText(context, "Copied", android.widget.Toast.LENGTH_SHORT).show()
                        }, icon = Icons.Outlined.ContentCopy)
                    }
                }
            }
        }
        item {
            HcCard(Modifier.clip(RoundedCornerShape(18.dp)).clickable(onClick = onAskDesk), border = HC.Green) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.ChatBubbleOutline, null, tint = HC.Green)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("Didn't find it?", style = MaterialTheme.typography.titleSmall, color = HC.GreenDark)
                        Text("Message the front desk. We reply in seconds, day and night.", color = HC.GreenDark, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}
