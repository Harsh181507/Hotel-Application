package com.hotelconcierge.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Brand colours (same as the website). */
object HC {
    val Bg = Color(0xFFF6F1E7)
    val Surface = Color(0xFFFFFDF8)
    val Surface2 = Color(0xFFEFE7D8)
    val Input = Color(0xFFECE2D0)
    val Border = Color(0xFFDDD0B9)
    val Text = Color(0xFF2E2620)
    val Muted = Color(0xFF8A7A68)
    val Green = Color(0xFF3F6B56)
    val GreenDark = Color(0xFF2F5241)
    val GreenSoft = Color(0xFFE7EDE3)
    val Maroon = Color(0xFF7D3A3A)
    val Amber = Color(0xFFB9822F)
    val AmberSoft = Color(0xFFF6EAD3)
    val Blue = Color(0xFF4A6C8C)
    val BlueSoft = Color(0xFFE1E9F1)
    val Red = Color(0xFFB2433B)
    val RedSoft = Color(0xFFF6E1DD)
    val Veg = Color(0xFF2E8B57)
}

private val Serif = FontFamily.Serif

private val HcTypography = Typography(
    displaySmall = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 34.sp, color = HC.Green),
    headlineMedium = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 28.sp),
    headlineSmall = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 24.sp),
    titleLarge = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 21.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    titleSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 23.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 12.sp, letterSpacing = 0.6.sp),
    labelSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 0.4.sp),
)

@Composable
fun HotelTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = HC.Maroon,
            onPrimary = Color.White,
            secondary = HC.Green,
            onSecondary = Color.White,
            secondaryContainer = HC.GreenSoft,
            onSecondaryContainer = HC.GreenDark,
            tertiary = HC.Amber,
            background = HC.Bg,
            onBackground = HC.Text,
            surface = HC.Surface,
            onSurface = HC.Text,
            surfaceVariant = HC.Input,
            onSurfaceVariant = HC.Muted,
            surfaceContainer = HC.Surface,
            surfaceContainerLow = HC.Surface,
            surfaceContainerHigh = HC.Surface,
            surfaceContainerHighest = HC.Input,
            outline = HC.Border,
            outlineVariant = HC.Border,
            error = HC.Red,
        ),
        typography = HcTypography,
        shapes = Shapes(
            small = RoundedCornerShape(12.dp),
            medium = RoundedCornerShape(16.dp),
            large = RoundedCornerShape(24.dp),
            extraLarge = RoundedCornerShape(28.dp),
        ),
        content = content,
    )
}
