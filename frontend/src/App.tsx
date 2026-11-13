// The complete route table. Every screen of SeatPlan is listed here once,
// so feature owners fill in their page file and never need to touch this one.
import { Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import EditorPage from "./pages/editor/EditorPage";
import AttendeePage from "./pages/events/AttendeePage";
import OrganiserPage from "./pages/events/OrganiserPage";
import AccountPage from "./pages/account/AccountPage";
import ForgotPage from "./pages/account/ForgotPage";
import GuestSignInPage from "./pages/account/GuestSignInPage";
import MyEventsPage from "./pages/account/MyEventsPage";
import MySeatPage from "./pages/account/MySeatPage";
import ResetPage from "./pages/account/ResetPage";
import Home from "./pages/Home";
import JoinPage from "./pages/join/JoinPage";
import JoinSignInPage from "./pages/join/JoinSignInPage";
import RegisterPage from "./pages/join/RegisterPage";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import OwnerHomePage from "./pages/owner/OwnerHomePage";
import OwnerSignUpPage from "./pages/owner/OwnerSignUpPage";
import NewRestaurantWizard from "./pages/owner/NewRestaurantWizard";
import ProfilePage from "./pages/owner/ProfilePage";
import PhotoEditorPage from "./pages/owner/PhotoEditor";
import BookingPage from "./pages/restaurant/BookingPage";
import ManageBookingPage from "./pages/restaurant/ManageBookingPage";
import StaffPage from "./pages/restaurant/StaffPage";
const RoomEditorPage = lazy(() => import("./pages/room-editor/RoomEditorPage"));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/owner" element={<OwnerHomePage />} />
      <Route path="/owner/sign-up" element={<OwnerSignUpPage />} />
      <Route path="/owner/new" element={<NewRestaurantWizard />} />
      <Route path="/owner/:venueId/setup" element={<NewRestaurantWizard />} />
      <Route path="/owner/:venueId/profile" element={<ProfilePage />} />
      <Route path="/owner/:venueId/photos" element={<PhotoEditorPage />} />
      <Route path="/owner/sign-in" element={<Login defaultNext="/owner" />} />
      <Route path="/owner/:venueId/dashboard" element={<StaffPage />} />
      <Route path="/owner/:venueId/rooms" element={<Suspense fallback={<p role="status">Loading room editor…</p>}><RoomEditorPage /></Suspense>} />
      {/* Events: personal attendee link, organiser workspace */}
      <Route path="/e/:token" element={<AttendeePage />} />
      <Route path="/organiser/:eventId" element={<OrganiserPage />} />
      {/* Events: the shared link (visitors) and guest accounts (docs/guest-accounts.md 10.3) */}
      <Route path="/j/:token" element={<JoinPage />} />
      <Route path="/j/:token/register" element={<RegisterPage />} />
      <Route path="/j/:token/sign-in" element={<JoinSignInPage />} />
      <Route path="/my" element={<MyEventsPage />} />
      {/* The fixed /my pages come before /my/:eventId, so "account" is never read as an event id. */}
      <Route path="/my/account" element={<AccountPage />} />
      <Route path="/my/sign-in" element={<GuestSignInPage />} />
      <Route path="/my/forgot" element={<ForgotPage />} />
      <Route path="/my/reset" element={<ResetPage />} />
      <Route path="/my/:eventId" element={<MySeatPage />} />
      {/* Restaurants: public booking, manage-or-cancel link, staff floor */}
      <Route path="/r/:venueId" element={<BookingPage />} />
      <Route path="/b/:token" element={<ManageBookingPage />} />
      <Route path="/staff/:venueId" element={<StaffPage />} />
      {/* Shared: floor-plan editor for both kinds of venue */}
      <Route path="/editor/:venueId" element={<EditorPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
