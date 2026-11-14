import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Children,
  isValidElement,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  getUser: vi.fn(),
  navigate: vi.fn(),
  getRole: vi.fn(),
  welcomeReceipt: vi.fn(),
  toastError: vi.fn(),
  mode: "signin",
}));
const outletId = "00000000-0000-0000-0000-000000000001";
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useSearch: () => ({ mode: mocks.mode }),
  }),
  useNavigate: () => mocks.navigate,
  Link: ({
    to,
    search: _search,
    ...props
  }: ComponentProps<"a"> & { to: string; search?: unknown }) => <a href={to} {...props} />,
}));
vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: () => ({ data: [{ id: outletId, name: "Campus kitchen" }] }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/catalog.queries", () => ({ publicOutletsQuery: {} }));
vi.mock("@/lib/roles.functions", () => ({ getMyRole: mocks.getRole }));
vi.mock("@/lib/transactions.functions", () => ({
  acknowledgeRegistrationRewards: mocks.welcomeReceipt,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signInWithPassword: mocks.signIn, signUp: mocks.signUp, getUser: mocks.getUser },
  },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
  }) => {
    const elements = Children.toArray(children).filter(
      isValidElement<{ id?: string; children?: ReactNode }>,
    );
    return (
      <select
        id={elements[0]?.props.id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        <option value="">Select</option>
        {elements[1]?.props.children}
      </select>
    );
  },
  SelectTrigger: () => null,
  SelectContent: () => null,
  SelectValue: () => null,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import { Route } from "@/routes/auth";
const Page = Route.options.component as ComponentType;
const change = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.mode = "signin";
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.signIn.mockResolvedValue({ error: { code: "email_not_confirmed" } });
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(cleanup);

describe("account form submission", () => {
  it("sends validated login credentials immediately and keeps email confirmation required", async () => {
    render(<Page />);
    change(/^Email address/, "ada@ebsonu.edu.ng");
    change(/^Password/, "sunset-garden");
    fireEvent.click(
      within(screen.getByLabelText(/^Password/).closest("form")!).getByRole("button", {
        name: "Sign in",
      }),
    );
    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith({
      email: "ada@ebsonu.edu.ng",
      password: "sunset-garden",
    });
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("sends a complete signup immediately and waits for email confirmation", async () => {
    mocks.mode = "signup";
    render(<Page />);
    change(/^First name/, "Ada");
    change(/^Last name/, "Obi");
    change(/^Email address/, "ada@ebsonu.edu.ng");
    change(/^Phone number/, "08030000000");
    change(/^Gender/, "female");
    change(/^Date of birth/, "2004-05-12");
    change(/^Your campus outlet/, outletId);
    change(/^Password/, "sunset-garden");
    change(/^Confirm password/, "sunset-garden");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create my account" }));
    expect(mocks.signUp).toHaveBeenCalledExactlyOnceWith({
      email: "ada@ebsonu.edu.ng",
      password: "sunset-garden",
      options: {
        emailRedirectTo: window.location.origin + "/auth",
        data: {
          full_name: "Ada Obi",
          first_name: "Ada",
          last_name: "Obi",
          phone: "+2348030000000",
          gender: "female",
          date_of_birth: "2004-05-12",
          outlet_id: outletId,
          referral_code: undefined,
        },
      },
    });
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("rejects incomplete credentials locally without starting a request", () => {
    render(<Page />);
    fireEvent.click(
      within(screen.getByLabelText(/^Password/).closest("form")!).getByRole("button", {
        name: "Sign in",
      }),
    );
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Let's get your seat ready",
      expect.objectContaining({ description: expect.stringContaining("Enter your email address") }),
    );
  });
});
