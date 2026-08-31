plugins {
    id("com.android.application")
}

android {
    namespace = "ar.vaad.catalogo.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "ar.vaad.catalogo.app"
        minSdk = 23
        targetSdk = 35
        versionCode = 13
        versionName = "0.10.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    sourceSets["main"].assets.srcDir("../web")
}
