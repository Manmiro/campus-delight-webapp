import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
}));

let emitAuthEvent: ((event: string, session: unknown) => void) | undefined;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      setSession: mocks.setSession,
      onAuthStateChange: mocks.onAuthStateChange,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess } }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));

import { Route } from "@/routes/reset-password";

const Page = Route.options.component as ComponentType;

beforeEach(() => {
  vi.clearAllMocks();
  emitAuthEvent = undefined;
  window.history.replaceState({}, "", "/reset-password");
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.exchangeCodeForSession.mockResolvedValue({ data: { session: { user: {} } }, error: null });
  mocks.setSession.mockResolvedValue({ data: { session: { user: {} } }, error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.onAuthStateChange.mockImplementation((callback) => {
    emitAuthEvent = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(cleanup);

describe("reset password page", () => {
  it("requests a reset email and shows the inbox confirmation", async () => {
    render(<Page />);
    await screen.findByRole("heading", { name: "Forgot your password?" });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "Ada@Example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("ada@example.com", {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    expect(
      await screen.findByText("Check your inbox. We've sent a password reset link to your email."),
    ).toBeInTheDocument();
  });

  it("guards an expired PKCE link instead of rendering the password form", async () => {
    window.history.replaceState({}, "", "/reset-password?code=expired-code");
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: new Error("expired"),
    });
    render(<Page />);

    expect(
      await screen.findByRole("heading", { name: "This reset link has expired" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request a fresh link" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("requires matching passwords before updating the recovery session", async () => {
    render(<Page />);
    await screen.findByRole("heading", { name: "Forgot your password?" });
    emitAuthEvent?.("PASSWORD_RECOVERY", { user: {} });
    await screen.findByRole("heading", { name: "Set a new password" });

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "Sunset-garden1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "Sunset-garden2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(mocks.updateUser).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "Sunset-garden1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledExactlyOnceWith({ password: "Sunset-garden1" }),
    );
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/auth", search: {} });
  });
});
