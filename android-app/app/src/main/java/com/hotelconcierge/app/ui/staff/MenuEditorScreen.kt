package com.hotelconcierge.app.ui.staff

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AddAPhoto
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.MenuItem
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.UploadedImage
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.common.SecondaryButton
import com.hotelconcierge.app.ui.common.SectionLabel
import com.hotelconcierge.app.ui.common.VegMark
import com.hotelconcierge.app.ui.guest.imageUrl
import com.hotelconcierge.app.ui.rupees
import com.hotelconcierge.app.ui.theme.HC
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.roundToInt

/** Shrinks a picked photo to at most 900 px and returns it as a JPEG data URL (about 50-150 KB). */
internal suspend fun photoDataUrl(context: Context, uri: Uri): String = withContext(Dispatchers.Default) {
    val source: Bitmap = if (Build.VERSION.SDK_INT >= 28) {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
            val longest = maxOf(info.size.width, info.size.height)
            if (longest > 900) {
                val scale = 900f / longest
                decoder.setTargetSize((info.size.width * scale).roundToInt(), (info.size.height * scale).roundToInt())
            }
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    } else {
        @Suppress("DEPRECATION")
        MediaStore.Images.Media.getBitmap(context.contentResolver, uri).let { full ->
            val longest = maxOf(full.width, full.height)
            if (longest <= 900) full else Bitmap.createScaledBitmap(full, full.width * 900 / longest, full.height * 900 / longest, true)
        }
    }
    var quality = 80
    var bytes: ByteArray
    do {
        bytes = ByteArrayOutputStream().also { source.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
        quality -= 15
    } while (bytes.size > 450_000 && quality > 20)
    "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
}

/**
 * Kitchen: switch dishes on/off when something runs out.
 * Front desk / admin: also add, edit and delete dishes with photos.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MenuEditorScreen(session: Session.Staff, onBack: (() -> Unit)? = null) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var menu by remember { mutableStateOf<List<MenuItem>?>(null) }
    var editing by remember { mutableStateOf<MenuItem?>(null) }
    var adding by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<MenuItem?>(null) }
    var loadingSample by remember { mutableStateOf(false) }

    suspend fun load() { menu = runCatching { Api.get<List<MenuItem>>("/api/staff/dining/items") }.getOrDefault(menu ?: emptyList()) }
    LaunchedEffect(Unit) { load() }
    OnLive("menu:updated") { load() }

    fun setAvailable(item: MenuItem, available: Boolean) = scope.launch {
        menu = menu?.map { if (it.id == item.id) it.copy(available = available) else it }
        runCatching { Api.patch<MenuItem>("/api/staff/dining/items/${item.id}", jsonOf("available" to available)) }
            .onSuccess { toast(if (available) "${item.name} is back on the menu" else "${item.name} marked sold out") }
            .onFailure { toast(it.message ?: "Failed"); load() }
    }

    Column(Modifier.fillMaxSize()) {
        val list = menu
        StaffHeader(
            "Menu",
            if (session.isDesk) "Tap a dish to edit it" else "Switch off dishes that run out",
            onBack = onBack,
        ) { if (session.isDesk) SecondaryButton("Add dish", { adding = true }, icon = Icons.Outlined.Add) }
        if (list == null) return@Column Loading()
        if (list.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                EmptyState(Icons.Outlined.Restaurant, "No dishes yet.", Modifier)
                if (session.isDesk) {
                    PrimaryButton("Load a sample menu", {
                        scope.launch {
                            loadingSample = true
                            runCatching { Api.send("POST", "/api/staff/dining/items/sample") }.onFailure { toast(it.message ?: "Failed") }
                            load(); loadingSample = false
                        }
                    }, loading = loadingSample)
                    Spacer(Modifier.height(8.dp))
                    Text("You can edit or delete the sample dishes afterwards.", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                }
            }
            return@Column
        }
        val groups = list.sortedWith(compareBy<MenuItem> { it.sortOrder }.thenBy { it.id }).groupBy { it.category }
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            groups.forEach { (category, dishes) ->
                item(key = "h-$category") { SectionLabel(category, Modifier.padding(top = 12.dp, bottom = 2.dp)) }
                items(dishes, key = { it.id }) { item ->
                    HcCard(Modifier.clip(RoundedCornerShape(18.dp))) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)).background(HC.Surface2), contentAlignment = Alignment.Center) {
                                if (item.imageId != null) {
                                    AsyncImage(imageUrl(session.server, item.imageId), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                } else Icon(Icons.Outlined.Restaurant, null, tint = HC.Muted)
                            }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    VegMark(item.veg)
                                    Text(
                                        "  ${item.name}", style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                        color = if (item.available) HC.Text else HC.Muted,
                                    )
                                    if (item.popular) Icon(Icons.Outlined.Star, "Popular", Modifier.padding(start = 4.dp).size(14.dp), tint = HC.Amber)
                                }
                                Text(
                                    rupees(item.pricePaise) + if (item.available) "" else " · Sold out",
                                    color = if (item.available) HC.Muted else HC.Red, style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            if (session.isDesk) {
                                IconButton(onClick = { editing = item }) { Icon(Icons.Outlined.Edit, "Edit ${item.name}", tint = HC.Muted) }
                            }
                            Switch(item.available, { setAvailable(item, it) }, colors = SwitchDefaults.colors(checkedTrackColor = HC.Green))
                        }
                    }
                }
            }
        }
    }

    if (adding || editing != null) {
        val categories = menu.orEmpty().map { it.category }.distinct()
        ModalBottomSheet(
            onDismissRequest = { adding = false; editing = null },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = HC.Surface,
        ) {
            DishForm(session, editing, categories, onSaved = { adding = false; editing = null; scope.launch { load() } }, onDelete = { deleting = it })
        }
    }

    deleting?.let { item ->
        ConfirmDialog("Delete ${item.name}?", "It will disappear from the guests' menu. Past orders keep their details.", "Delete", {
            scope.launch {
                runCatching { Api.send("DELETE", "/api/staff/dining/items/${item.id}") }
                    .onSuccess { editing = null; toast("${item.name} deleted"); load() }
                    .onFailure { toast(it.message ?: "Failed") }
            }
        }, { deleting = null })
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun DishForm(session: Session.Staff, item: MenuItem?, categories: List<String>, onSaved: () -> Unit, onDelete: (MenuItem) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var category by remember { mutableStateOf(item?.category ?: categories.firstOrNull() ?: "") }
    var name by remember { mutableStateOf(item?.name ?: "") }
    var description by remember { mutableStateOf(item?.description ?: "") }
    var price by remember { mutableStateOf(item?.let { (it.pricePaise / 100.0).let { p -> if (p % 1.0 == 0.0) p.toInt().toString() else p.toString() } } ?: "") }
    var veg by remember { mutableStateOf(item?.veg ?: true) }
    var popular by remember { mutableStateOf(item?.popular ?: false) }
    var available by remember { mutableStateOf(item?.available ?: true) }
    var imageId by remember { mutableStateOf(item?.imageId) }
    var uploading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            uploading = true; error = null
            runCatching {
                val dataUrl = photoDataUrl(context, uri)
                Api.post<UploadedImage>("/api/staff/dining/images", jsonOf("dataUrl" to dataUrl))
            }.onSuccess { imageId = it.id }.onFailure { error = "Photo upload failed: ${it.message}" }
            uploading = false
        }
    }

    val pricePaise = price.replace(",", "").toDoubleOrNull()?.let { (it * 100).roundToInt() }
    val valid = category.isNotBlank() && name.isNotBlank() && pricePaise != null && pricePaise >= 0

    Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (item == null) "Add a dish" else "Edit dish", style = MaterialTheme.typography.titleLarge)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(96.dp).clip(RoundedCornerShape(16.dp)).background(HC.Surface2),
                contentAlignment = Alignment.Center,
            ) {
                val id = imageId
                when {
                    uploading -> Loading(Modifier.size(40.dp))
                    id != null -> AsyncImage(imageUrl(session.server, id), "Dish photo", Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    else -> Icon(Icons.Outlined.AddAPhoto, null, tint = HC.Muted)
                }
            }
            Spacer(Modifier.width(14.dp))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SecondaryButton(if (imageId == null) "Add photo" else "Change photo", {
                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }, icon = Icons.Outlined.AddAPhoto, enabled = !uploading)
                if (imageId != null) SecondaryButton("Remove photo", { imageId = null })
            }
        }
        Field(name, { name = it.take(100) }, "Dish name", placeholder = "e.g. Masala Dosa")
        Field(category, { category = it.take(50) }, "Category", placeholder = "e.g. Breakfast")
        if (categories.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                categories.forEach { c -> HcChip(c, category == c, { category = c }) }
            }
        }
        Field(price, { v -> price = v.filter { it.isDigit() || it == '.' }.take(9) }, "Price (₹)", keyboardType = KeyboardType.Decimal)
        Field(description, { description = it.take(300) }, "Short description (optional)", singleLine = false, minLines = 2)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            HcChip("Veg", veg, { veg = true })
            HcChip("Non-veg", !veg, { veg = false })
            HcChip("Popular", popular, { popular = !popular }, Icons.Outlined.Star)
            HcChip("Available", available, { available = !available })
        }
        ErrorText(error)
        PrimaryButton(if (item == null) "Add to menu" else "Save changes", {
            scope.launch {
                saving = true; error = null
                val body = jsonOf(
                    "category" to category.trim(), "name" to name.trim(), "description" to description.trim(),
                    "price_paise" to pricePaise, "image_id" to imageId, "veg" to veg, "popular" to popular,
                    "available" to available, "sort_order" to (item?.sortOrder ?: 0),
                )
                runCatching {
                    if (item == null) Api.post<MenuItem>("/api/staff/dining/items", body) else Api.put<MenuItem>("/api/staff/dining/items/${item.id}", body)
                }.onSuccess { onSaved() }.onFailure { error = it.message; saving = false }
            }
        }, enabled = valid && !uploading, loading = saving, modifier = Modifier.fillMaxWidth())
        if (item != null) {
            SecondaryButton("Delete dish", { onDelete(item) }, icon = Icons.Outlined.Delete, modifier = Modifier.fillMaxWidth())
        }
    }
}

