package com.hotelconcierge.app.ui.guest

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.Receipt
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.GuestInfo
import com.hotelconcierge.app.data.Live
import com.hotelconcierge.app.data.RoomBill
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.common.BillItemRow
import com.hotelconcierge.app.ui.common.BillTotals
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.InfoText
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.PaymentRow
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.common.SecondaryButton
import com.hotelconcierge.app.ui.common.SectionLabel
import com.hotelconcierge.app.ui.rupees
import com.hotelconcierge.app.ui.staff.rememberToast
import com.hotelconcierge.app.ui.theme.HC
import com.hotelconcierge.app.ui.upiUri
import kotlinx.coroutines.launch

private data class Paying(val amountPaise: Int, val chargeIds: List<Int>)

/** The guest's room bill: every item with Paid / Checking / Unpaid, and paying with the hotel's UPI QR. */
@Composable
fun BillTab(session: Session.Guest, info: GuestInfo?) {
    var bill by remember { mutableStateOf<RoomBill?>(null) }
    var paying by remember { mutableStateOf<Paying?>(null) }
    val toast = rememberToast()

    suspend fun load() { runCatching { Api.get<RoomBill>("/api/guest/bill") }.onSuccess { bill = it } }
    LaunchedEffect(Unit) { load() }
    LaunchedEffect(Unit) { Live.events.collect { if (it.name == "bill:updated" || it.name == "connect") load() } }

    val b = bill ?: return Loading()
    val payment = info?.payment
    val canPay = payment?.ready == true
    val settled = b.items.isNotEmpty() && b.balancePaise <= 0

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Your bill", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(10.dp))
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (settled) HC.GreenSoft else HC.Surface)
                    .border(1.dp, if (settled) HC.Green.copy(alpha = 0.3f) else HC.Border, RoundedCornerShape(18.dp)).padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(if (settled) Icons.Outlined.CheckCircle else Icons.Outlined.AccountBalanceWallet, null, tint = if (settled) HC.Green else HC.Maroon)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (settled) "All paid" else rupees(maxOf(0, b.balancePaise)), fontFamily = FontFamily.Serif, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
                    Text(if (settled) "Thank you!" else "to pay", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                }
                if (b.dueNowPaise > 0 && canPay) PrimaryButton("Pay ${rupees(b.dueNowPaise)}", { paying = Paying(b.dueNowPaise, emptyList()) })
            }
            if (b.pendingPaise > 0) { Spacer(Modifier.height(10.dp)); InfoText("${rupees(b.pendingPaise)} sent. The front desk will confirm it shortly.") }
            if (b.dueNowPaise > 0 && !canPay) Text("Please pay at the front desk before you check out.", color = HC.Muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
        }
        if (b.items.isEmpty()) {
            item { EmptyState(Icons.Outlined.Receipt, "Nothing on your bill yet. Room service, restaurant bills and vehicle bookings will show here.", Modifier.fillMaxWidth()) }
        } else {
            item {
                HcCard {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                        b.items.forEachIndexed { i, item ->
                            if (i > 0) HorizontalDivider(color = HC.Border)
                            BillItemRow(item) {
                                if (item.status == "unpaid" && canPay && b.dueNowPaise > 0) {
                                    TextButton(onClick = { paying = Paying(item.totalPaise, listOf(item.id)) }) { Text("Pay", color = HC.Maroon) }
                                }
                            }
                        }
                    }
                }
            }
            item { BillTotals(b) }
        }
        if (b.payments.isNotEmpty()) {
            item { SectionLabel("Payments") }
            items(b.payments, key = { it.id }) { PaymentRow(it) }
        }
    }

    paying?.let { p ->
        PaySheet(session, payment!!, p, onClose = { paying = null }, onSent = { next ->
            bill = next
            paying = null
            toast("Sent! The front desk will confirm your payment.")
        })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PaySheet(
    session: Session.Guest, payment: com.hotelconcierge.app.data.PaymentInfo, paying: Paying,
    onClose: () -> Unit, onSent: (RoomBill) -> Unit,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var utr by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun send() = scope.launch {
        busy = true
        error = null
        runCatching { Api.post<RoomBill>("/api/guest/payments", jsonOf("utr" to utr, "chargeIds" to paying.chargeIds)) }
            .onSuccess(onSent)
            .onFailure { error = it.message; busy = false }
    }

    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = HC.Surface) {
        Column(
            Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Pay ${rupees(paying.amountPaise)}", style = MaterialTheme.typography.titleLarge)
            Text("1. Pay ${rupees(paying.amountPaise)} with any UPI app (GPay, PhonePe, Paytm…).\n2. Copy the UPI reference number (UTR, usually 12 digits) from the receipt.\n3. Enter it below. The front desk checks it and marks your bill paid.", color = HC.Muted)
            if (payment.upiId.isNotBlank()) {
                PrimaryButton("Pay with UPI app", {
                    val intent = Intent(Intent.ACTION_VIEW, upiUri(payment, paying.amountPaise, "Room ${session.roomNumber} bill"))
                    try {
                        context.startActivity(Intent.createChooser(intent, "Pay with"))
                    } catch (_: ActivityNotFoundException) {
                        toast("No UPI app found on this phone. Scan the QR from another phone instead.")
                    }
                }, icon = Icons.Outlined.PhoneAndroid, modifier = Modifier.fillMaxWidth(), color = HC.Green)
            }
            payment.qrImageId?.let { id ->
                Text("Or scan this QR from another phone:", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                AsyncImage(
                    model = imageUrl(session.server, id), contentDescription = "UPI QR code of ${payment.payeeName}", contentScale = ContentScale.Fit,
                    modifier = Modifier.align(Alignment.CenterHorizontally).size(230.dp).clip(RoundedCornerShape(16.dp)).background(Color.White)
                        .border(1.dp, HC.Border, RoundedCornerShape(16.dp)).padding(8.dp),
                )
            }
            if (payment.upiId.isNotBlank()) {
                Row(Modifier.align(Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                    Text("UPI ID: "); Text(payment.upiId, fontWeight = FontWeight.Bold)
                    IconButton(onClick = { clipboard.setText(AnnotatedString(payment.upiId)); toast("UPI ID copied") }) { Icon(Icons.Outlined.ContentCopy, "Copy UPI ID", Modifier.size(18.dp)) }
                }
            }
            Field(
                utr, { utr = it.filter(Char::isLetterOrDigit).take(35) }, "UPI reference number (UTR)",
                placeholder = "e.g. 412345678901", keyboardType = KeyboardType.Number, onDone = { if (utr.length >= 6 && !busy) send() },
            )
            ErrorText(error)
            PrimaryButton("I have paid · send reference", { send() }, enabled = utr.length >= 6, loading = busy, modifier = Modifier.fillMaxWidth())
            SecondaryButton("Cancel", onClose, modifier = Modifier.fillMaxWidth())
        }
    }
}
