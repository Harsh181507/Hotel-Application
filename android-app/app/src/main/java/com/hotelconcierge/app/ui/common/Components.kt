package com.hotelconcierge.app.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import com.hotelconcierge.app.ui.theme.HC

enum class Tone(val bg: Color, val fg: Color) {
    Amber(HC.AmberSoft, Color(0xFF8A5D17)),
    Blue(HC.BlueSoft, Color(0xFF34506B)),
    Green(HC.GreenSoft, HC.GreenDark),
    Grey(HC.Surface2, HC.Muted),
    Red(HC.RedSoft, Color(0xFF8C2F28)),
}

@Composable
fun StatusPill(text: String, tone: Tone, icon: ImageVector? = null) {
    Row(
        Modifier.clip(CircleShape).background(tone.bg).padding(horizontal = 10.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, null, Modifier.size(13.dp), tint = tone.fg)
            Spacer(Modifier.width(4.dp))
        }
        Text(text, style = MaterialTheme.typography.labelMedium, color = tone.fg)
    }
}

/** Indian veg / non-veg mark: green or red dot in a square. */
@Composable
fun VegMark(veg: Boolean) {
    val color = if (veg) HC.Veg else HC.Red
    Box(
        Modifier.size(14.dp).border(1.5.dp, color, RoundedCornerShape(3.dp)),
        contentAlignment = Alignment.Center,
    ) { Box(Modifier.size(6.dp).clip(CircleShape).background(color)) }
}

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    icon: ImageVector? = null,
    color: Color = HC.Maroon,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.height(52.dp),
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(containerColor = color, disabledContainerColor = color.copy(alpha = 0.45f), disabledContentColor = Color.White),
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
        } else {
            if (icon != null) { Icon(icon, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)) }
            Text(text, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, enabled: Boolean = true) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier,
        shape = CircleShape,
        border = BorderStroke(1.dp, HC.Border),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = HC.Surface, contentColor = HC.Text),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
    ) {
        if (icon != null) { Icon(icon, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)) }
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun SmallButton(text: String, onClick: () -> Unit, icon: ImageVector? = null, primary: Boolean = false) {
    Button(
        onClick = onClick,
        shape = CircleShape,
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
        modifier = Modifier.height(38.dp),
        colors = if (primary) ButtonDefaults.buttonColors(containerColor = HC.Maroon)
        else ButtonDefaults.buttonColors(containerColor = HC.Surface2, contentColor = HC.Text),
    ) {
        if (icon != null) { Icon(icon, null, Modifier.size(15.dp)); Spacer(Modifier.width(5.dp)) }
        Text(text, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
fun Field(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    password: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    enabled: Boolean = true,
    supporting: String? = null,
    /** When set, the keyboard shows a "Done" key that runs this (e.g. log in). */
    onDone: (() -> Unit)? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it) } },
        modifier = modifier.fillMaxWidth(),
        singleLine = singleLine,
        minLines = minLines,
        enabled = enabled,
        shape = RoundedCornerShape(14.dp),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = if (onDone != null) ImeAction.Done else if (singleLine) ImeAction.Next else ImeAction.Default),
        keyboardActions = if (onDone != null) KeyboardActions(onDone = { onDone() }) else KeyboardActions.Default,
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        supportingText = supporting?.let { { Text(it) } },
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = HC.Surface,
            unfocusedContainerColor = HC.Input,
            disabledContainerColor = HC.Surface2,
            focusedBorderColor = HC.Green,
            unfocusedBorderColor = HC.Border,
            focusedLabelColor = HC.Green,
        ),
    )
}

@Composable
fun HcChip(text: String, selected: Boolean, onClick: () -> Unit, icon: ImageVector? = null) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(text) },
        leadingIcon = icon?.let { { Icon(it, null, Modifier.size(16.dp)) } },
        shape = CircleShape,
        colors = FilterChipDefaults.filterChipColors(
            containerColor = HC.Surface,
            selectedContainerColor = HC.Green,
            selectedLabelColor = Color.White,
            selectedLeadingIconColor = Color.White,
        ),
        border = FilterChipDefaults.filterChipBorder(enabled = true, selected = selected, borderColor = HC.Border, selectedBorderColor = HC.Green),
    )
}

@Composable
fun HcCard(modifier: Modifier = Modifier, border: Color = HC.Border, content: @Composable () -> Unit) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = HC.Surface,
        border = BorderStroke(1.dp, border),
    ) { content() }
}

@Composable
fun Loading(modifier: Modifier = Modifier.fillMaxSize()) {
    Box(modifier, contentAlignment = Alignment.Center) { CircularProgressIndicator(color = HC.Green, strokeWidth = 3.dp) }
}

@Composable
fun EmptyState(icon: ImageVector, text: String, modifier: Modifier = Modifier.fillMaxSize()) {
    Column(modifier.padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Box(Modifier.size(60.dp).clip(CircleShape).background(HC.GreenSoft), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = HC.Green, modifier = Modifier.size(28.dp))
        }
        Spacer(Modifier.height(12.dp))
        Text(text, color = HC.Muted, textAlign = TextAlign.Center)
    }
}

@Composable
fun ErrorText(text: String?) {
    if (text.isNullOrBlank()) return
    Text(
        text,
        color = Color(0xFF8C2F28),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(HC.RedSoft).padding(12.dp),
        style = MaterialTheme.typography.bodyMedium,
    )
}

@Composable
fun InfoText(text: String?) {
    if (text.isNullOrBlank()) return
    Text(
        text,
        color = HC.GreenDark,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(HC.GreenSoft).padding(12.dp),
        style = MaterialTheme.typography.bodyMedium,
    )
}

@Composable
fun RoomBadge(number: String, size: Int = 46) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(14.dp)).background(HC.GreenSoft),
        contentAlignment = Alignment.Center,
    ) { Text(number, color = HC.GreenDark, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium) }
}

@Composable
fun CountBadge(count: Int) {
    if (count <= 0) return
    Box(Modifier.clip(CircleShape).background(HC.Maroon).padding(horizontal = 7.dp, vertical = 1.dp), contentAlignment = Alignment.Center) {
        Text(if (count > 99) "99+" else count.toString(), color = Color.White, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelMedium, color = HC.Green, modifier = modifier)
}
