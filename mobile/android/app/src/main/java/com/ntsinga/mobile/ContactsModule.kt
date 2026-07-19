package com.ntsinga.mobile

import android.Manifest
import android.provider.ContactsContract
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

// Safety cap: this device surface can return thousands of rows; cap the bridge
// payload rather than serializing a contact list without bound.
private const val MAX_CONTACTS = 500

class ContactsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ContactsManager"

  @ReactMethod
  fun getContacts(promise: Promise) {
    PermissionHelper.requestPermission(reactContext, Manifest.permission.READ_CONTACTS, promise) {
      resolveContacts(promise)
    }
  }

  private fun resolveContacts(promise: Promise) {
    try {
      val projection = arrayOf(
        ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
        ContactsContract.CommonDataKinds.Phone.NUMBER
      )

      val result = Arguments.createArray()
      val seenContactIds = HashSet<String>()

      reactContext.contentResolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        projection,
        null,
        null,
        "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
      )?.use { cursor ->
        val idIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
        val nameIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
        val numberIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)

        while (cursor.moveToNext() && seenContactIds.size < MAX_CONTACTS) {
          val contactId = cursor.getString(idIndex) ?: continue
          val name = cursor.getString(nameIndex) ?: continue
          val number = cursor.getString(numberIndex) ?: continue

          // A contact can have multiple phone numbers; take the first one seen
          // (query is sorted by name, not by contact, so this is arbitrary but stable per run).
          if (!seenContactIds.add(contactId)) continue

          val contact = Arguments.createMap().apply {
            putString("id", contactId)
            putString("name", name)
            putString("phoneNumber", number)
          }
          result.pushMap(contact)
        }
      }

      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("CONTACTS_GET_CONTACTS_FAILED", error)
    }
  }
}
