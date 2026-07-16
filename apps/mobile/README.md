# TropTix Organizer Mobile App

This document outlines the architecture, features, and instructions on how to run the TropTix Organizer mobile app.

## Overview

The TropTix Organizer is a mobile application built for event organizers. It allows organizers to manage their events on the go, view event details, and scan attendee tickets (QR codes) for entry management.

## Tech Stack

- **Framework:** [Expo](https://expo.dev/) (React Native)
- **Routing:** [Expo Router](https://docs.expo.dev/router/introduction/) (File-based routing)
- **Backend/API:** [tRPC](https://trpc.io/) and [Supabase](https://supabase.com/)
- **Camera/Scanning:** `expo-camera` for QR code scanning
- **Language:** TypeScript

## Architecture

The app follows a modern Expo Router architecture.

- **`app/`**: Contains the file-based routing.
  - **`(auth)`**: Authentication flow (login, etc.).
  - **`(tabs)`**: Main application tabs for authenticated users.
  - **`event/`**: Detailed view and management for specific events.
- **`components/`**: Reusable UI components.
- **`context/`**: React contexts for state management.
- **`lib/`**: Utility functions, API clients (tRPC/Supabase configuration).

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Yarn](https://yarnpkg.com/) or npm
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Expo Go app installed on your physical mobile device (iOS/Android), or an iOS Simulator / Android Emulator running on your machine.

## Getting Started

1. **Install Dependencies**
   Navigate to the mobile app directory and install the required dependencies:

   ```bash
   cd apps/mobile
   yarn install
   ```

2. **Environment Configuration**
   Ensure you have the appropriate environment variables set up. You may need a `.env` file in the `apps/mobile` directory containing your Supabase and API URLs. Check the `.env.example` (if available) or coordinate with the backend team.

3. **Start the Local Web/API Server**
   The mobile app relies on the local API to function. In a separate terminal window, navigate to the `apps/web` directory and start the development server:

   ```bash
   cd apps/web
   yarn dev
   ```

   This command starts the Next.js web application and tRPC API (typically on `http://localhost:3000`). Make sure this is running before you interact with the mobile app.

4. **Start the Mobile Development Server**
   Start the Expo development server:

   ```bash
   yarn start
   ```

   Or use specific commands for your target platform:
   - `yarn ios` (Starts the iOS simulator)
   - `yarn android` (Starts the Android emulator)
   - `yarn web` (Starts the web version, though some native features like camera might not work optimally)

5. **Running on a Physical Device**
   When the Metro bundler starts, it will display a QR code in your terminal.
   - **iOS:** Open the native Camera app and scan the QR code. It will prompt you to open Expo Go.
   - **Android:** Open the Expo Go app and select "Scan QR Code".

## Key Features

- **Ticket Scanning:** Utilizes the device's camera to scan QR codes for attendee check-in. Note that testing camera functionality usually requires a physical device rather than a simulator.
- **Event Management:** Organizers can view their events, check statistics, and manage attendee lists.
- **Authentication:** Secure login using Supabase authentication integrated with tRPC for typed API calls.

## Troubleshooting

- **Camera Permissions:** If the camera doesn't open, ensure you have granted camera permissions to Expo Go in your device settings.
- **Network Issues:** If the app cannot connect to the local API, make sure your mobile device and your development machine are on the same Wi-Fi network. You might also need to use your machine's local IP address in the `.env` file instead of `localhost`.
