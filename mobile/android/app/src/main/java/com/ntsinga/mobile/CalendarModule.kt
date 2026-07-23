package com.ntsinga.mobile

import android.Manifest
import android.provider.CalendarContract
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CalendarModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosCalendar"

  @ReactMethod
  fun getUpcomingEvents(hours: Double, promise: Promise) {
    PermissionHelper.requestPermission(reactContext, Manifest.permission.READ_CALENDAR, promise) {
      try {
        val windowHours = hours.toLong().coerceIn(1L, 168L)
        val now = System.currentTimeMillis(); val end = now + windowHours * 60L * 60L * 1000L
        val result = Arguments.createArray()
        val projection = arrayOf(CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END, CalendarContract.Instances.EVENT_LOCATION, CalendarContract.Instances.ORGANIZER, CalendarContract.Instances.ALL_DAY)
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().appendPath(now.toString()).appendPath(end.toString()).build()
        reactContext.contentResolver.query(uri, projection, null, null, "${CalendarContract.Instances.BEGIN} ASC")?.use { cursor ->
          val id = cursor.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_ID); val title = cursor.getColumnIndexOrThrow(CalendarContract.Instances.TITLE); val begin = cursor.getColumnIndexOrThrow(CalendarContract.Instances.BEGIN); val finish = cursor.getColumnIndexOrThrow(CalendarContract.Instances.END); val location = cursor.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_LOCATION); val organizer = cursor.getColumnIndexOrThrow(CalendarContract.Instances.ORGANIZER); val allDay = cursor.getColumnIndexOrThrow(CalendarContract.Instances.ALL_DAY)
          while (cursor.moveToNext() && result.size() < 100) result.pushMap(Arguments.createMap().apply { putString("eventId", cursor.getString(id)); putString("title", cursor.getString(title) ?: "Untitled event"); putDouble("startEpochMs", cursor.getLong(begin).toDouble()); putDouble("endEpochMs", cursor.getLong(finish).toDouble()); putString("location", cursor.getString(location) ?: ""); putString("organizer", cursor.getString(organizer) ?: ""); putBoolean("allDay", cursor.getInt(allDay) != 0) })
        }
        promise.resolve(result)
      } catch (error: Exception) { promise.reject("CALENDAR_EVENTS_FAILED", error) }
    }
  }
}
