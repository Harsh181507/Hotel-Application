package com.hotelconcierge.app.ui.staff

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.text.Html
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Print
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.BillChanged
import com.hotelconcierge.app.data.BillItem
import com.hotelconcierge.app.data.BillSummary
import com.hotelconcierge.app.data.Live
import com.hotelconcierge.app.data.PendingPayment
import com.hotelconcierge.app.data.RoomBill
import com.hotelconcierge.app.data.decode
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.CHARGE_KIND
import com.hotelconcierge.app.ui.PAYMENT_METHOD
import com.hotelconcierge.app.ui.PAY_STATUS
import com.hotelconcierge.app.ui.common.BillItemRow
import com.hotelconcierge.app.ui.common.BillTotals
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.PaymentRow
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.common.SecondaryButton
import com.hotelconcierge.app.ui.common.SectionLabel
import com.hotelconcierge.app.ui.common.SmallButton
import com.hotelconcierge.app.ui.common.StatusPill
import com.hotelconcierge.app.ui.common.Tone
import com.hotelconcierge.app.ui.dayLabel
import com.hotelconcierge.app.ui.pct
import com.hotelconcierge.app.ui.rupees
import com.hotelconcierge.app.ui.theme.HC
import com.hotelconcierge.app.ui.timeAgo
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val dateFmt = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)
private val dateTimeFmt = DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a", Locale.ENGLISH)
private fun fmt(iso: String?, f: DateTimeFormatter) = iso?.let { Instant.parse(it).atZone(ZoneId.systemDefault()).format(f) } ?: "—"
private fun paise(text: String): Int = ((text.replace(",", "").toDoubleOrNull() ?: 0.0) * 100).let { Math.round(it).toInt() }

/** Room bills and payments for the front desk. Opens straight on one bill when [openStayId] is given. */
@Composable
fun BillsScreen(onBack: () -> Unit, openStayId: Int? = null) {
    var selected by remember { mutableStateOf(openStayId) }
    val stayId = selected
    if (stayId != null) BillDetail(stayId, onBack = { if (openStayId != null) onBack() else selected = null })
    else BillList(onBack, onOpen = { selected = it })
}

@Composable
private fun PendingPaymentCard(p: PendingPayment, showRoom: Boolean = true, onDone: suspend () -> Unit) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var rejecting by remember { mutableStateOf(false) }
    fun decide(confirm: Boolean) = scope.launch {
        runCatching { Api.send("POST", "/api/staff/billing/payments/${p.id}/${if (confirm) "confirm" else "reject"}", jsonOf()) }
            .onSuccess { toast(if (confirm) "${rupees(p.amountPaise)} confirmed" else "Marked as not received") }
            .onFailure { toast(it.message ?: "Failed") }
        onDone()
    }
    HcCard(border = Color(0xFFE3C48F)) {
        Column(Modifier.background(HC.AmberSoft).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${rupees(p.amountPaise)} by UPI${if (showRoom) " · Room ${p.roomNumber}" else ""}", fontWeight = FontWeight.Bold)
            Text("UPI ref ${p.utr}${if (showRoom) " · ${p.guestName}" else ""} · ${timeAgo(p.createdAt)}", style = MaterialTheme.typography.bodySmall)
            Text("Check this reference in your bank / UPI app, then confirm.", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                SmallButton("Received", { decide(true) }, Icons.Outlined.Check, primary = true)
                SmallButton("Not received", { rejecting = true }, Icons.Outlined.Close)
            }
        }
    }
    if (rejecting) {
        ConfirmDialog("Not received?", "${rupees(p.amountPaise)} with UPI ref ${p.utr} will be marked as not received, and the guest will be asked to check it.", "Not received", { decide(false) }, { rejecting = false })
    }
}

// ---------- List ----------

@Composable
private fun BillList(onBack: () -> Unit, onOpen: (Int) -> Unit) {
    var bills by remember { mutableStateOf<List<BillSummary>?>(null) }
    var pending by remember { mutableStateOf<List<PendingPayment>>(emptyList()) }
    suspend fun load() {
        bills = runCatching { Api.get<List<BillSummary>>("/api/staff/billing/bills") }.getOrDefault(bills ?: emptyList())
        runCatching { Api.get<List<PendingPayment>>("/api/staff/billing/payments/pending") }.onSuccess { pending = it }
    }
    LaunchedEffect(Unit) { load() }
    OnLive("payment:submitted", "bill:updated", "stay:updated") { load() }

    Column(Modifier.fillMaxSize()) {
        StaffHeader("Bills", "Final bill per room, with what is paid", onBack = onBack)
        val list = bills ?: return@Column Loading()
        val current = list.filter { it.active }
        val past = list.filter { !it.active }
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (pending.isNotEmpty()) {
                item { SectionLabel("UPI payments to check", Modifier.padding(top = 4.dp)) }
                items(pending, key = { "p${it.id}" }) { PendingPaymentCard(it) { load() } }
            }
            item { SectionLabel("Guests in the hotel", Modifier.padding(top = 10.dp)) }
            if (current.isEmpty()) item { Text("No guests checked in.", color = HC.Muted) }
            items(current, key = { "a${it.stayId}" }) { BillRow(it) { onOpen(it.stayId) } }
            if (past.isNotEmpty()) {
                item { SectionLabel("Checked out (last 30 days)", Modifier.padding(top = 10.dp)) }
                items(past, key = { "c${it.stayId}" }) { BillRow(it) { onOpen(it.stayId) } }
            }
        }
    }
}

@Composable
private fun BillRow(b: BillSummary, onClick: () -> Unit) {
    HcCard(Modifier.clickable(onClick = onClick)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(b.roomNumber, fontFamily = FontFamily.Serif, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(60.dp))
            Column(Modifier.weight(1f)) {
                Text(b.guestName, fontWeight = FontWeight.SemiBold)
                Text(
                    (if (b.active) "In since ${dayLabel(b.checkedInAt)}" else "Left ${dayLabel(b.checkedOutAt)}") + " · Total ${rupees(b.totalPaise)}",
                    color = HC.Muted, style = MaterialTheme.typography.bodySmall,
                )
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (b.pendingPayments > 0) StatusPill("UPI to check", Tone.Amber)
                when {
                    b.balancePaise > 0 -> Text("${rupees(b.balancePaise)} due", color = Color(0xFF8C2F28), fontWeight = FontWeight.Bold)
                    b.totalPaise > 0 -> Text("Paid", color = HC.GreenDark, fontWeight = FontWeight.Bold)
                    else -> Text("Nothing yet", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

// ---------- One bill ----------

private sealed interface BillDialog {
    data object Charge : BillDialog
    data object Advance : BillDialog
    data class Pay(val chargeIds: List<Int>) : BillDialog
    data class Remove(val item: BillItem) : BillDialog
    data class Undo(val payment: com.hotelconcierge.app.data.BillPayment) : BillDialog
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BillDetail(stayId: Int, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var bill by remember { mutableStateOf<RoomBill?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var dialog by remember { mutableStateOf<BillDialog?>(null) }

    suspend fun load() {
        runCatching { Api.get<RoomBill>("/api/staff/billing/stays/$stayId") }.onSuccess { bill = it; error = null }.onFailure { error = it.message }
    }
    LaunchedEffect(stayId) { load() }
    LaunchedEffect(stayId) {
        Live.events.collect { e ->
            when (e.name) {
                "bill:updated" -> if (e.decode<BillChanged>()?.stayId == stayId) load()
                "payment:submitted" -> if (e.decode<PendingPayment>()?.stayId == stayId) load()
                "connect" -> load()
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        val b = bill
        StaffHeader(b?.let { "Room ${it.stay.roomNumber} · ${it.stay.guestName}" } ?: "Bill", b?.let {
            "In ${fmt(it.stay.checkedInAt, dateTimeFmt)}" + (it.stay.checkedOutAt?.let { out -> " · Out ${fmt(out, dateTimeFmt)}" } ?: " · Checked in")
        }, onBack = onBack) {
            if (b != null) IconButton(onClick = { printBill(context, b) }) { Icon(Icons.Outlined.Print, "Print or save as PDF") }
        }
        if (b == null) {
            if (error != null) Column(Modifier.padding(16.dp)) { ErrorText(error) } else Loading()
            return@Column
        }
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PrimaryButton(
                        if (b.dueNowPaise > 0) "Take payment · ${rupees(b.dueNowPaise)}" else "Nothing due",
                        { dialog = BillDialog.Pay(emptyList()) }, enabled = b.dueNowPaise > 0, icon = Icons.Outlined.Payments,
                    )
                    SecondaryButton("Add charge / discount", { dialog = BillDialog.Charge }, icon = Icons.Outlined.Add)
                    SecondaryButton("Advance paid", { dialog = BillDialog.Advance }, icon = Icons.Outlined.Add)
                }
            }
            b.payments.filter { it.status == "pending" }.forEach { p ->
                item(key = "pp${p.id}") {
                    PendingPaymentCard(
                        PendingPayment(p.id, stayId, b.stay.roomNumber, b.stay.guestName, p.amountPaise, p.utr ?: "", p.createdAt),
                        showRoom = false,
                    ) { load() }
                }
            }
            item {
                if (b.items.isEmpty()) {
                    EmptyState(Icons.Outlined.ReceiptLong, "Nothing on this bill yet.", Modifier.fillMaxWidth())
                } else {
                    HcCard {
                        Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                            b.items.forEachIndexed { i, item ->
                                if (i > 0) HorizontalDivider(color = HC.Border)
                                BillItemRow(item) {
                                    Row {
                                        if (item.status == "unpaid") TextButton(onClick = { dialog = BillDialog.Pay(listOf(item.id)) }) { Text("Mark paid", color = HC.Maroon) }
                                        if (item.kind in setOf("restaurant", "extra", "discount") && !item.locked) {
                                            TextButton(onClick = { dialog = BillDialog.Remove(item) }) { Text("Remove", color = HC.Muted) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            item { BillTotals(b) }
            if (b.payments.isNotEmpty()) {
                item { SectionLabel("Payments") }
                items(b.payments, key = { "pay${it.id}" }) { p ->
                    PaymentRow(p) {
                        if (p.status == "confirmed") IconButton(onClick = { dialog = BillDialog.Undo(p) }) { Icon(Icons.AutoMirrored.Outlined.Undo, "Undo payment", tint = HC.Muted) }
                    }
                }
            }
        }
    }

    val b = bill ?: return
    fun post(path: String, body: kotlinx.serialization.json.JsonObject, done: String) = scope.launch {
        runCatching { Api.post<RoomBill>(path, body) }
            .onSuccess { bill = it; dialog = null; toast(done) }
            .onFailure { toast(it.message ?: "Failed") }
    }
    when (val d = dialog) {
        BillDialog.Charge -> ChargeDialog(onDismiss = { dialog = null }) { kind, description, amount ->
            post("/api/staff/billing/stays/$stayId/charges", jsonOf("kind" to kind, "description" to description, "amountPaise" to amount), if (kind == "discount") "Discount added" else "Added to the bill")
        }
        BillDialog.Advance -> AdvanceDialog(onDismiss = { dialog = null }) { amount, note ->
            post("/api/staff/billing/stays/$stayId/advance", jsonOf("amountPaise" to amount, "note" to note), "Advance recorded")
        }
        is BillDialog.Pay -> {
            val items = b.items.filter { it.id in d.chargeIds }
            val amount = if (d.chargeIds.isEmpty()) b.dueNowPaise else items.sumOf { it.totalPaise }
            PaymentDialog(amount, if (d.chargeIds.isEmpty()) "Everything still due on this bill." else items.joinToString(", ") { it.description }, onDismiss = { dialog = null }) { method, utr, note ->
                val body = buildList<Pair<String, Any?>> {
                    add("method" to method); add("chargeIds" to d.chargeIds); add("note" to note)
                    if (utr.isNotBlank()) add("utr" to utr)
                }
                post("/api/staff/billing/stays/$stayId/payments", jsonOf(*body.toTypedArray()), "${rupees(amount)} received")
            }
        }
        is BillDialog.Remove -> ConfirmDialog("Remove from the bill?", d.item.description, "Remove", {
            scope.launch {
                runCatching { Api.send("DELETE", "/api/staff/billing/charges/${d.item.id}") }.onFailure { toast(it.message ?: "Failed") }
                load()
            }
        }, { dialog = null })
        is BillDialog.Undo -> ConfirmDialog(
            "Undo this payment?", "${rupees(d.payment.amountPaise)} (${PAYMENT_METHOD[d.payment.method]}). Use this only if it was recorded by mistake.", "Undo payment",
            { post("/api/staff/billing/payments/${d.payment.id}/reject", jsonOf("note" to "Undone by front desk"), "Payment undone") }, { dialog = null },
        )
        null -> {}
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChargeDialog(onDismiss: () -> Unit, onSave: (kind: String, description: String, amountPaise: Int) -> Unit) {
    val defaults = mapOf("restaurant" to "Restaurant bill", "extra" to "", "discount" to "Discount")
    var kind by remember { mutableStateOf("restaurant") }
    var description by remember { mutableStateOf("Restaurant bill") }
    var amount by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add to the bill") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("restaurant" to "Restaurant bill", "extra" to "Extra (laundry…)", "discount" to "Discount").forEach { (k, label) ->
                        HcChip(label, kind == k, { kind = k; description = defaults.getValue(k) })
                    }
                }
                Field(description, { description = it.take(200) }, "Description", placeholder = if (kind == "extra") "e.g. Laundry (3 shirts)" else null)
                Field(
                    amount, { amount = it.filter { c -> c.isDigit() || c == '.' }.take(10) }, if (kind == "discount") "Discount (₹)" else "Amount before GST (₹)",
                    keyboardType = KeyboardType.Decimal, supporting = if (kind == "discount") "Taken off the total." else "GST is added using the rates in Settings.",
                )
            }
        },
        confirmButton = { TextButton(enabled = description.isNotBlank() && paise(amount) > 0, onClick = { onSave(kind, description.trim(), paise(amount)) }) { Text("Add") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        containerColor = HC.Surface,
    )
}

@Composable
private fun AdvanceDialog(onDismiss: () -> Unit, onSave: (amountPaise: Int, note: String) -> Unit) {
    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Advance paid before arrival") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field(amount, { amount = it.filter { c -> c.isDigit() || c == '.' }.take(10) }, "Amount (₹)", keyboardType = KeyboardType.Decimal)
                Field(note, { note = it.take(200) }, "Note (optional)", placeholder = "e.g. Paid via booking site")
            }
        },
        confirmButton = { TextButton(enabled = paise(amount) > 0, onClick = { onSave(paise(amount), note.trim()) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        containerColor = HC.Surface,
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PaymentDialog(amountPaise: Int, what: String, onDismiss: () -> Unit, onSave: (method: String, utr: String, note: String) -> Unit) {
    var method by remember { mutableStateOf("cash") }
    var utr by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Take payment · ${rupees(amountPaise)}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(what, color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("cash", "upi", "card", "other").forEach { m -> HcChip(PAYMENT_METHOD.getValue(m), method == m, { method = m }) }
                }
                if (method == "upi") Field(utr, { utr = it.take(35) }, "UPI reference (optional)")
                Field(note, { note = it.take(200) }, "Note (optional)")
            }
        },
        confirmButton = { TextButton(enabled = amountPaise > 0, onClick = { onSave(method, utr.trim(), note.trim()) }) { Text("Received ${rupees(amountPaise)}") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        containerColor = HC.Surface,
    )
}

// ---------- Printing ----------

// Kept until the print job has the page (a WebView that's garbage-collected mid-print prints nothing).
private var printingView: WebView? = null

/** Opens Android's print screen for the bill: a printer, or "Save as PDF" to share it. */
fun printBill(context: Context, bill: RoomBill) {
    val esc = { s: String -> Html.escapeHtml(s) }
    val rows = bill.items.joinToString("") { i ->
        "<tr><td>${fmt(i.createdAt, dateFmt)}</td><td>${esc(i.description)}<br><small>${CHARGE_KIND[i.kind] ?: i.kind}</small></td>" +
            "<td class=n>${rupees(i.amountPaise)}</td><td class=n>${if (i.taxPaise != 0) "${rupees(i.taxPaise)} (${pct(i.taxPct)}%)" else "—"}</td>" +
            "<td class=n>${rupees(i.totalPaise)}</td><td>${i.status?.let { PAY_STATUS[it]?.first } ?: ""}</td></tr>"
    }
    val totals = buildString {
        append("<div><span>Subtotal</span><span>${rupees(bill.subtotalPaise)}</span></div>")
        if (bill.discountPaise != 0) append("<div><span>Discount</span><span>${rupees(bill.discountPaise)}</span></div>")
        bill.taxes.forEach { append("<div><span>GST ${pct(it.pct)}%</span><span>${rupees(it.paise)}</span></div>") }
        append("<div class=g><span>Total</span><span>${rupees(bill.totalPaise)}</span></div>")
        bill.payments.filter { it.status == "confirmed" }.forEach {
            append("<div><span>Paid · ${PAYMENT_METHOD[it.method]}${it.utr?.let { u -> " " + esc(u) } ?: ""}</span><span>${rupees(-it.amountPaise)}</span></div>")
        }
        append("<div class=g><span>${if (bill.balancePaise < 0) "Refund due" else "Balance due"}</span><span>${rupees(kotlin.math.abs(bill.balancePaise))}</span></div>")
    }
    val paid = bill.items.isNotEmpty() && bill.balancePaise <= 0
    val html = """
        <html><head><meta charset="utf-8"><style>
          body { font-family: sans-serif; font-size: 12px; color: #000; margin: 24px; }
          h1 { font-size: 22px; margin: 0; }
          .head { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; }
          th, td { border-bottom: 1px solid #bbb; padding: 5px 4px; text-align: left; vertical-align: top; }
          .n { text-align: right; white-space: nowrap; }
          small { color: #555; }
          .totals { margin-left: auto; width: 300px; }
          .totals div { display: flex; justify-content: space-between; padding: 2px 0; }
          .totals .g { font-weight: bold; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
          .stamp { display: inline-block; border: 2px solid #000; padding: 4px 12px; font-weight: bold; letter-spacing: 2px; margin-top: 14px; }
        </style></head><body>
          <div class="head">
            <div><h1>${esc(bill.hotel.name)}</h1>${if (bill.hotel.gstin.isNotBlank()) "GSTIN: ${esc(bill.hotel.gstin)}" else ""}</div>
            <div style="text-align:right"><b>BILL No. ${bill.stay.id}</b><br>Printed ${fmt(Instant.now().toString(), dateTimeFmt)}</div>
          </div>
          <b>${esc(bill.stay.guestName)}</b> · Room ${esc(bill.stay.roomNumber)}<br>
          Check-in ${fmt(bill.stay.checkedInAt, dateFmt)} · Check-out ${fmt(bill.stay.checkedOutAt, dateFmt)}
          <table><tr><th>Date</th><th>Description</th><th class=n>Amount</th><th class=n>GST</th><th class=n>Total</th><th>Status</th></tr>$rows</table>
          <div class="totals">$totals</div>
          <div class="stamp">${if (paid) "PAID" else "BALANCE DUE ${rupees(maxOf(0, bill.balancePaise))}"}</div>
        </body></html>
    """.trimIndent()

    val view = WebView(context)
    printingView = view
    view.webViewClient = object : WebViewClient() {
        override fun onPageFinished(page: WebView, url: String?) {
            val manager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
            val name = "Bill ${bill.stay.id} - Room ${bill.stay.roomNumber}"
            manager.print(name, page.createPrintDocumentAdapter(name), PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
        }
    }
    view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
}

