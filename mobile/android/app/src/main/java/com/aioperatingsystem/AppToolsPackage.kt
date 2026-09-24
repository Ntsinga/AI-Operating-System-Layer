package com.aioperatingsystem

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AppToolsPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(
    AppManagerModule(reactContext),
    DeviceInfoModule(reactContext),
    LocationModule(reactContext),
    ContactsModule(reactContext),
    AudioModule(reactContext),
    DeepLinkModule(reactContext),
    SmsModule(reactContext),
    SystemSettingsModule(reactContext),
    MediaCaptureModule(reactContext),
    PhoneCallModule(reactContext),
    AudioRecorderModule(reactContext),
    OverlayModule(reactContext),
    VoiceActivationModule(reactContext),
    LiveVoiceModule(reactContext),
    WallpaperModule(reactContext),
    BrowserModule(reactContext),
    BoardModule(reactContext),
    StorageInfoModule(reactContext),
    NetworkInfoModule(reactContext),
    NetworkActionsModule(reactContext),
    BatteryDiagnosticsModule(reactContext),
    UsageStatsModule(reactContext),
    StorageCleanupModule(reactContext),
    DevicePolicyModule(reactContext),
    FocusPolicyModule(reactContext),
    AlarmModule(reactContext),
    ScheduledAlarmModule(reactContext),
    AppHealthModule(reactContext),
    CalendarModule(reactContext),
    BriefStoreModule(reactContext),
    SmsInboxModule(reactContext),
    LearningWatcherModule(reactContext),
    ExpenseStoreModule(reactContext),
    PrefsModule(reactContext)
  )

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
