package com.hotelconcierge.app.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.BillItem
import com.hotelconcierge.app.data.BillPayment
import com.hotelconcierge.app.data.RoomBill
import com.hotelconcierge.app.ui.CHARGE_KIND
import com.hotelconcierge.app.ui.PAYMENT_METHOD
import com.hotelconcierge.app.ui.PAY_STATUS
import com.hotelconcierge.app.ui.dayLabel
import com.hotelconcierge.app.ui.pct
import com.hotelconcierge.app.ui.rupees
import com.hotelconcierge.app.ui.theme.HC

// Pieces of the room bill shared by the guest's Bill tab and the front desk's bill screen.

@Composable
private fun Line(label: String, value: String, bold: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, Modifier.weight(1f), fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal, color = if (bold) HC.Text else HC.Muted)
        Text(value, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)
    }
}

/** Subtotal, discount, GST per rate, total, paid and balance. */
@Composable
fun BillTotals(bill: RoomBill) {
    HcCard {
        Column(Modifier.padding(16.dp)) {
            Line("Subtotal", rupees(bill.subtotalPaise))
            if (bill.discountPaise != 0) Line("Discount", rupees(bill.discountPaise))
            bill.taxes.forEach { Line("GST ${pct(it.pct)}%", rupees(it.paise)) }
            HorizontalDivider(color = HC.Border, modifier = Modifier.padding(vertical = 6.dp))
            Line("Total", rupees(bill.totalPaise), bold = true)
            if (bill.paidPaise > 0) Line("Paid", rupees(-bill.paidPaise))
            HorizontalDivider(color = HC.Border, modifier = Modifier.padding(vertical = 6.dp))
            Line(if (bill.balancePaise < 0) "Refund due" else "Balance", rupees(kotlin.math.abs(bill.balancePaise)), bold = true)
        }
    }
}

/** One bill line: what, when, amount + GST, status, and optional buttons on the right. */
@Composable
fun BillItemRow(item: BillItem, actions: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f)) {
            Text("${CHARGE_KIND[item.kind] ?: item.kind} · ${dayLabel(item.createdAt)}".uppercase(), style = MaterialTheme.typography.labelSmall, color = HC.Muted)
            Text(item.description, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = if (item.kind == "discount") HC.GreenDark else HC.Text)
            if (item.taxPaise != 0) Text("${rupees(item.amountPaise)} + ${pct(item.taxPct)}% GST ${rupees(item.taxPaise)}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.width(10.dp))
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(rupees(item.totalPaise), fontWeight = FontWeight.Bold)
            item.status?.let { s -> PAY_STATUS[s]?.let { (label, tone) -> StatusPill(label, tone) } }
            actions()
        }
    }
}

/** A payment line: method, reference, status. */
@Composable
fun PaymentRow(p: BillPayment, trailing: @Composable () -> Unit = {}) {
    val struck = p.status == "rejected"
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(
                listOfNotNull(PAYMENT_METHOD[p.method] ?: p.method, p.utr?.let { "ref $it" }, dayLabel(p.createdAt), p.staffName?.takeIf { p.status != "pending" }).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, textDecoration = if (struck) TextDecoration.LineThrough else null,
            )
            if (p.note.isNotBlank()) Text(p.note, color = HC.Muted, style = MaterialTheme.typography.bodySmall)
        }
        when (p.status) {
            "pending" -> StatusPill("Checking", Tone.Amber)
            "rejected" -> StatusPill("Not received", Tone.Red)
        }
        Spacer(Modifier.width(8.dp))
        Text(rupees(p.amountPaise), fontWeight = FontWeight.SemiBold, textDecoration = if (struck) TextDecoration.LineThrough else null)
        trailing()
    }
}
