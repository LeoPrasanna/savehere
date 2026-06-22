import { Redirect } from 'expo-router';

// The landing screen now shows as the entry gate inside the home screen.
// This route just redirects anything pointing at /landing back to home.
export default function LandingRoute() {
  return <Redirect href="/" />;
}
