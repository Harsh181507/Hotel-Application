package com.hotelconcierge.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Shapes of the data the server sends. Names match the server's JSON
// (some endpoints use snake_case, some camelCase).

// ---------- Logins ----------

@Serializable
data class StaffProfile(val id: Int, val name: String, val email: String = "", val role: String)

@Serializable
data class StaffLoginResponse(val token: String, val staff: StaffProfile)

@Serializable
data class GuestProfile(val name: String, val roomNumber: String, val hotelName: String = "")

@Serializable
data class GuestLoginResponse(val token: String, val guest: GuestProfile)

@Serializable
data class RoomInfo(val roomNumber: String, val hotelName: String)

// ---------- Chat ----------

@Serializable
data class Message(
    val id: String, // big number: sent as text by the server
    @SerialName("stay_id") val stayId: Int,
    val sender: String, // guest | staff | system | bot
    @SerialName("staff_id") val staffId: Int? = null,
    val body: String,
    @SerialName("request_id") val requestId: Int? = null,
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class Conversation(
    @SerialName("stay_id") val stayId: Int,
    @SerialName("guest_name") val guestName: String,
    @SerialName("guest_login") val guestLogin: String,
    @SerialName("room_number") val roomNumber: String,
    @SerialName("last_body") val lastBody: String? = null,
    @SerialName("last_sender") val lastSender: String? = null,
    @SerialName("last_at") val lastAt: String? = null,
    val unread: Int = 0,
)

// ---------- Answers ----------

@Serializable
data class Faq(
    val id: Int,
    val category: String,
    val question: String,
    val answer: String,
    val keywords: String = "",
    @SerialName("sort_order") val sortOrder: Int = 0,
)

// ---------- Requests / tasks ----------

@Serializable
data class ServiceRequest(
    val id: Int,
    @SerialName("stay_id") val stayId: Int,
    val type: String,
    val department: String = "reception",
    val details: String = "",
    val status: String,
    @SerialName("assigned_to") val assignedTo: Int? = null,
    @SerialName("escalated_at") val escalatedAt: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("room_number") val roomNumber: String = "",
    @SerialName("guest_name") val guestName: String = "",
    @SerialName("assigned_name") val assignedName: String? = null,
)

// ---------- Dining ----------

@Serializable
data class MenuItem(
    val id: Int,
    val category: String,
    val name: String,
    val description: String = "",
    @SerialName("price_paise") val pricePaise: Int,
    @SerialName("image_id") val imageId: Int? = null,
    val veg: Boolean = true,
    val popular: Boolean = false,
    val available: Boolean = true,
    @SerialName("sort_order") val sortOrder: Int = 0,
)

@Serializable
data class OrderLine(
    val name: String,
    val quantity: Int,
    @SerialName("unit_price_paise") val unitPricePaise: Int,
)

@Serializable
data class Order(
    val id: Int,
    @SerialName("stay_id") val stayId: Int,
    val status: String, // placed | preparing | on_the_way | delivered | cancelled
    val note: String = "",
    @SerialName("total_paise") val totalPaise: Int,
    @SerialName("escalated_at") val escalatedAt: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("room_number") val roomNumber: String = "",
    @SerialName("guest_name") val guestName: String = "",
    val items: List<OrderLine> = emptyList(),
)

@Serializable
data class Bill(val orders: List<Order> = emptyList(), @SerialName("total_paise") val totalPaise: Int = 0)

@Serializable
data class UploadedImage(val id: Int, val url: String)

// ---------- Rooms & check-in ----------

@Serializable
data class RoomStay(val id: Int, val guestName: String, val guestLogin: String, val checkedInAt: String? = null)

@Serializable
data class Room(
    val id: Int,
    val number: String,
    val link: String,
    val hkStatus: String = "ready",
    val dnd: Boolean = false,
    val stay: RoomStay? = null,
)

@Serializable
data class StayRef(val id: Int)

@Serializable
data class CheckinResponse(val stay: StayRef, val guestId: String, val code: String, val link: String)

@Serializable
data class NewCodeResponse(val guestId: String, val code: String)

@Serializable
data class GuestRoomState(val dnd: Boolean = false, @SerialName("hk_status") val hkStatus: String = "ready")

// ---------- Housekeeping ----------

@Serializable
data class HkRoom(
    val id: Int,
    val number: String,
    val floor: String? = null,
    @SerialName("hk_status") val status: String,
    @SerialName("hk_priority") val priority: Boolean = false,
    @SerialName("hk_note") val note: String = "",
    @SerialName("hk_assigned_to") val assignedTo: Int? = null,
    @SerialName("hk_assigned_name") val assignedName: String? = null,
    @SerialName("hk_updated_at") val updatedAt: String? = null,
    val dnd: Boolean = false,
    val occupied: Boolean = false,
)

@Serializable
data class Housekeeper(val id: Int, val name: String, val floors: String = "", @SerialName("open_rooms") val openRooms: Int = 0)

// ---------- Team & settings ----------

@Serializable
data class StaffUser(
    val id: Int,
    val name: String,
    val login: String,
    val role: String,
    val floors: String = "",
    val active: Boolean = true,
)

@Serializable
data class HotelSettings(
    val name: String,
    @SerialName("autopilot_mode") val autopilotMode: String,
    @SerialName("night_start") val nightStart: String,
    @SerialName("night_end") val nightEnd: String,
    val timezone: String,
    @SerialName("escalate_after_minutes") val escalateAfterMinutes: Int,
    @SerialName("require_inspection") val requireInspection: Boolean,
)

// ---------- Live events ----------

@Serializable
data class AutopilotHandled(val stayId: Int, val action: String)

@Serializable
data class SessionEnded(val reason: String = "")

@Serializable
data class Typing(val stayId: Int? = null, val from: String = "")

@Serializable
data class MessagesRead(val stayId: Int, val by: String)
