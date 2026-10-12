package com.hotelconcierge.app.ui.staff

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.QuestionAnswer
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.Faq
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.common.InfoText
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.common.SecondaryButton
import com.hotelconcierge.app.ui.common.SectionLabel
import com.hotelconcierge.app.ui.theme.HC
import kotlinx.coroutines.launch

/** The hotel's own answers (Wi-Fi, timings, nearby places). Guests read them for free; the autopilot replies with them. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnswersEditorScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var faqs by remember { mutableStateOf<List<Faq>?>(null) }
    var editing by remember { mutableStateOf<Faq?>(null) }
    var adding by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<Faq?>(null) }

    suspend fun load() { faqs = runCatching { Api.get<List<Faq>>("/api/staff/faqs") }.getOrDefault(faqs ?: emptyList()) }
    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize()) {
        val list = faqs
        StaffHeader("Answers", list?.let { "${it.size} answers guests can read" }, onBack = onBack) {
            SecondaryButton("Add", { adding = true }, icon = Icons.Outlined.Add)
        }
        if (list == null) return@Column Loading()
        if (list.isEmpty()) return@Column EmptyState(Icons.Outlined.QuestionAnswer, "No answers yet. Add your Wi-Fi password, breakfast timings and nearby places.")
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                InfoText("Keywords help the autopilot: add words guests might type, e.g. \"wifi, internet, password\".")
            }
            list.groupBy { it.category }.forEach { (category, rows) ->
                item(key = "h-$category") { SectionLabel(category, Modifier.padding(top = 12.dp, bottom = 2.dp)) }
                items(rows, key = { it.id }) { f ->
                    HcCard(Modifier.clip(RoundedCornerShape(18.dp)).clickable { editing = f }) {
                        Column(Modifier.padding(14.dp)) {
                            Text(f.question, style = MaterialTheme.typography.titleSmall)
                            Text(f.answer, color = HC.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            if (f.keywords.isNotBlank()) Text("Keywords: ${f.keywords}", color = HC.Green, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }

    if (adding || editing != null) {
        ModalBottomSheet(
            onDismissRequest = { adding = false; editing = null },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = HC.Surface,
        ) {
            AnswerForm(
                editing, faqs.orEmpty().map { it.category }.distinct(),
                onSaved = { adding = false; editing = null; toast("Saved. Guests see it right away."); scope.launch { load() } },
                onDelete = { deleting = it },
            )
        }
    }

    deleting?.let { f ->
        ConfirmDialog("Delete this answer?", f.question, "Delete", {
            scope.launch {
                runCatching { Api.send("DELETE", "/api/staff/faqs/${f.id}") }
                    .onSuccess { editing = null; load() }
                    .onFailure { toast(it.message ?: "Failed") }
            }
        }, { deleting = null })
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun AnswerForm(faq: Faq?, categories: List<String>, onSaved: () -> Unit, onDelete: (Faq) -> Unit) {
    val scope = rememberCoroutineScope()
    var category by remember { mutableStateOf(faq?.category ?: categories.firstOrNull() ?: "General") }
    var question by remember { mutableStateOf(faq?.question ?: "") }
    var answer by remember { mutableStateOf(faq?.answer ?: "") }
    var keywords by remember { mutableStateOf(faq?.keywords ?: "") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val suggestions = (categories + listOf("General", "Wi-Fi", "Dining", "Nearby", "Services")).distinct()

    Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (faq == null) "Add an answer" else "Edit answer", style = MaterialTheme.typography.titleLarge)
        Field(category, { category = it.take(50) }, "Category")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            suggestions.forEach { c -> HcChip(c, category == c, { category = c }) }
        }
        Field(question, { question = it.take(300) }, "Question", placeholder = "e.g. What is the Wi-Fi password?")
        Field(answer, { answer = it.take(5000) }, "Answer", singleLine = false, minLines = 3)
        Field(keywords, { keywords = it.take(500) }, "Keywords (optional)", placeholder = "wifi, internet, password", supporting = "Comma separated words guests might use")
        ErrorText(error)
        PrimaryButton(if (faq == null) "Add answer" else "Save changes", {
            scope.launch {
                saving = true; error = null
                val body = jsonOf(
                    "category" to category.trim().ifEmpty { "General" }, "question" to question.trim(), "answer" to answer.trim(),
                    "keywords" to keywords.trim(), "sortOrder" to (faq?.sortOrder ?: 0),
                )
                runCatching {
                    if (faq == null) Api.post<Faq>("/api/staff/faqs", body) else Api.put<Faq>("/api/staff/faqs/${faq.id}", body)
                }.onSuccess { onSaved() }.onFailure { error = it.message; saving = false }
            }
        }, enabled = question.isNotBlank() && answer.isNotBlank(), loading = saving, modifier = Modifier.fillMaxWidth())
        if (faq != null) SecondaryButton("Delete answer", { onDelete(faq) }, icon = Icons.Outlined.Delete, modifier = Modifier.fillMaxWidth())
    }
}
