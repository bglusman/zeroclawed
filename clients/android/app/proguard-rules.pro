# ZeroClaw Android ProGuard Rules
# Goal: Smallest possible APK

# ============================================
# KEEP NATIVE BRIDGE
# ============================================
-keep class ai.zeroclaw.android.bridge.** { *; }
-keepclassmembers class ai.zeroclaw.android.bridge.** { *; }

# Keep JNI methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# ============================================
# KEEP DATA CLASSES
# ============================================
-keep class ai.zeroclaw.android.data.** { *; }
-keepclassmembers class ai.zeroclaw.android.data.** { *; }

# ============================================
# KOTLIN SERIALIZATION
# ============================================
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { 
    *** Companion; 
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ============================================
# AGGRESSIVE OPTIMIZATIONS
# ============================================

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}

# Remove Kotlin null checks (we handle nulls properly)
-assumenosideeffects class kotlin.jvm.internal.Intrinsics {
    public static void checkNotNull(...);
    public static void checkNotNullParameter(...);
    public static void checkNotNullExpressionValue(...);
}

# Optimize enums
-optimizations !code/simplification/enum*

# Remove unused Compose stuff
-dontwarn androidx.compose.**

# ============================================
# SIZE OPTIMIZATIONS
# ============================================

# Merge classes where possible
-repackageclasses ''
-allowaccessmodification

# Remove unused code paths
-optimizationpasses 5

# Don't keep attributes we don't need
-keepattributes SourceFile,LineNumberTable  # Keep for crash reports
-renamesourcefileattribute SourceFile
