---
name: android-design-guidelines
description: Material Design 3 and Android platform guidelines for AI agents.
triggers: Tasks involving Android UI, Compose components, dynamic color, or M3 compliance.
license: MIT
metadata:
  version: "1.0.0"
---

# Android Platform Design Guidelines — Material Design 3

## 1. Material You & Theming
### 1.1 Dynamic Color
* **Strategy:** Enable dynamic color derived from the user's wallpaper as the primary theming strategy (Android 12+ / API 31+).
* **Fallback:** Provide a sophisticated, hardcoded M3 baseline palette (Primary, Secondary, Tertiary, Neutral) if dynamic color is unavailable or disabled.
* **Implementation:** Wrap the theme block in `dynamicLightColorScheme` or `dynamicDarkColorScheme` checks.

### 1.2 Color Roles
* **Semantic Naming:** Always use functional, role-based color tokens rather than rigid color descriptions (e.g., use `MaterialTheme.colorScheme.primary` instead of `Color.Blue`).
* **Contrast:** Ensure all text/icon surface pairings adhere strictly to WCAG AA guidelines (minimum 4.5:1 contrast ratio for normal text).

## 2. Typography Hierarchy
* **Font Scaling:** Utilize the official M3 Type Scale mapped to Spacing-Independent Pixels (`sp`).
* **Hierarchy Roles:**
  * `Display` (Large, Medium, Small): For critical, low-density splash or hero headers.
  * `Headline` (Large, Medium, Small): For primary screen headers.
  * `Title` (Large, Medium, Small): For top app bars and card titles.
  * `Body` (Large, Medium, Small): For long-form text.
  * `Label` (Large, Medium, Small): For buttons, captions, and micro-copy.

## 3. Layout & Component Geometry
### 3.1 Spacing & Grid System
* **4dp Grid:** Base all component layouts on a strict **4dp spacing scale** (4dp, 8dp, 12dp, 16dp, 24dp, 32dp).
* **Screen Margins:** Use `16dp` mobile screen margins for standard content and `24dp` for high-density layouts or tablets.

### 3.2 Component Targets & States
* **Touch Targets:** All interactive elements must maintain a minimum touch target size of **48dp x 48dp** to ensure accessibility.
* **Component States:** Explicitly define behaviors and visual changes for all states: `Default`, `Hovered`, `Focused`, `Pressed`, `Dragged`, and `Disabled`.

## 4. Depth & Tonal Elevation
* **Tonal Elevation:** M3 uses color shifting over drop shadows to represent depth. Higher elevation surfaces receive a stronger prominence of the primary color overlay.
* **Scaffolding:** Utilize standard `Surface` or `Card` components with built-in elevation tokens to handle layout structure natively.

## 5. Jetpack Compose Guardrails (Do's and Don'ts)
* **DO:** Use standard M3 composables (`Button`, `OutlinedButton`, `TextButton`, `FilterChip`, `NavigationSuiteScaffold`).
* **DO:** Rely on `Modifier` parameters for passing styling constraints downward; do not hardcode sizing inside low-level child components.
* **DON'T:** Use legacy XML-based layout mentalities or legacy Material 2 configurations (`TopAppBar` vs M3's `MediumTopAppBar`).
* **DON'T:** Create custom styling structures that bypass the unified `MaterialTheme` context window.
