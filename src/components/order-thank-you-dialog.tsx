import { Link } from '@tanstack/react-router';
import { Bike, CalendarDays, Check, Coins, CreditCard, MapPin, ShoppingBasket, Sparkles, Wallet } from 'lucide-react';
import logo from '@/assets/logo.jpg';
import heroMeal from '@/assets/hero-meal.jpg';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Confetti } from '@/components/fun/confetti';
import { naira } from '@/lib/format';

export type PlacedOrder = {
  reference: string | null;
  firstName: string;
  outletName: string;
  items: { name: string; quantity: number; lineKobo: number }[];
  fulfillment: 'delivery' | 'pickup';
  address: string;
  foodKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  method: string;
  creditTotalKobo?: number | undefined;
  termDays?: number | undefined;
  burst: number;
};

const METHOD: Record<string, { label: string; Icon: typeof Wallet }> = {
  cash_wallet: { label: 'Cash wallet', Icon: Wallet },
  tokens: { label: 'Tokens', Icon: Coins },
  subscription_entitlement: { label: 'Meal plan', Icon: CalendarDays },
  food_credit: { label: 'Eat Now & Pay Later', Icon: CreditCard },
};

export function OrderThankYouDialog({ order, onClose }: { order: PlacedOrder | null; onClose: () => void }) {
  const m = order ? (METHOD[order.method] ?? { label: order.method, Icon: Wallet }) : METHOD['cash_wallet']!;
  const delivery = order?.fulfillment === 'delivery';
  return <>
    <Confetti fire={order?.burst ?? 0} />
    <Dialog open={!!order} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:p-0 motion-reduce:animate-none">
        {order && <>
          <div className="relative shrink-0 overflow-hidden bg-primary px-6 pb-7 pt-6 text-center text-primary-foreground [@media(max-height:640px)]:pb-4 [@media(max-height:640px)]:pt-4">
            <img src={heroMeal} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" />
            <span aria-hidden className="absolute left-5 top-5 animate-float text-2xl motion-reduce:animate-none">🍛</span>
            <span aria-hidden className="absolute right-6 top-8 animate-float text-2xl [animation-delay:1.2s] motion-reduce:animate-none">🥤</span>
            <div className="relative">
              <div className="mx-auto flex items-center justify-center gap-2"><img src={logo} alt="Campus Delight" className="h-9 w-9 rounded-full" /><span className="text-sm font-bold">Campus Delight</span></div>
              <div className="relative mx-auto mt-4 grid h-20 w-20 place-items-center [@media(max-height:640px)]:h-14 [@media(max-height:640px)]:w-14">
                <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-golden/40 motion-reduce:hidden" />
                <span className="relative grid h-full w-full animate-pop-in place-items-center rounded-full bg-golden text-golden-foreground shadow-glow motion-reduce:animate-none">
                  <Check className="h-10 w-10 [@media(max-height:640px)]:h-7 [@media(max-height:640px)]:w-7" strokeWidth={3} />
                </span>
              </div>
              <DialogTitle className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-normal">Thank you, {order.firstName}! 🎉</DialogTitle>
              <DialogDescription className="mx-auto mt-2 max-w-sm text-primary-foreground/90">
                Your order is in and the kitchen is already warming up. Great food is on its way to making your day delicious.
              </DialogDescription>
              {order.reference && <p className="mx-auto mt-3 inline-flex rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-bold tracking-wide">Order {order.reference}</p>}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 sm:p-6">
            <section aria-label={delivery ? 'Delivery details' : 'Pickup details'} className="animate-in fade-in slide-in-from-bottom-2 rounded-lg border-l-4 border-primary bg-accent/50 p-4 motion-reduce:animate-none">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  {delivery ? <Bike className="h-6 w-6 animate-wiggle motion-reduce:animate-none" /> : <ShoppingBasket className="h-6 w-6 animate-wiggle motion-reduce:animate-none" />}
                </span>
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold">{delivery ? 'Delivery' : 'Pickup'}</p>
                  {delivery ? <>
                    <p className="flex items-start gap-1 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="whitespace-pre-wrap break-words">{order.address}</span></p>
                    <p className="mt-1 text-xs text-muted-foreground">Coming to you from {order.outletName}. Keep your phone close.</p>
                  </> : <>
                    <p className="flex items-start gap-1 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{order.outletName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Come to the outlet to collect your meal. Show your order number at the counter.</p>
                  </>}
                </div>
              </div>
            </section>

            <section aria-label="Order items">
              <h2 className="text-xs font-bold uppercase text-muted-foreground">Your order</h2>
              <ul className="mt-2 divide-y divide-border">
                {order.items.map((it, i) => <li key={`${it.name}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm animate-in fade-in slide-in-from-left-2 motion-reduce:animate-none" style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'both' }}>
                  <span className="min-w-0 truncate"><span className="mr-2 inline-grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-xs font-bold text-primary">{it.quantity}×</span>{it.name}</span>
                  <span className="shrink-0 font-semibold">{order.method === 'subscription_entitlement' ? 'Plan' : naira(it.lineKobo)}</span>
                </li>)}
              </ul>
            </section>

            <dl className="space-y-2 border-y border-border py-3 text-sm">
              <div className="flex justify-between gap-2"><dt>Food</dt><dd>{order.method === 'subscription_entitlement' ? 'Covered by your meal plan' : naira(order.foodKobo)}</dd></div>
              <div className="flex justify-between gap-2"><dt>{delivery ? 'Delivery fee' : 'Pickup'}</dt><dd>{delivery ? naira(order.deliveryFeeKobo) : 'Free'}</dd></div>
              <div className="flex justify-between gap-2 font-display text-xl font-bold"><dt>Total paid</dt><dd className="text-primary">{order.method === 'food_credit' ? naira(0) : naira(order.totalKobo)}</dd></div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><dt>Paid with</dt><dd className="flex items-center gap-1 font-semibold text-foreground"><m.Icon className="h-4 w-4 text-primary" />{m.label}</dd></div>
              {order.method === 'food_credit' && order.creditTotalKobo !== undefined && <div className="flex justify-between gap-2 text-xs"><dt>To repay within {order.termDays} days</dt><dd className="font-semibold">{naira(order.creditTotalKobo)}</dd></div>}
            </dl>

            <p className="flex items-start gap-2 rounded-lg bg-golden/15 p-3 text-sm"><Sparkles className="h-5 w-5 shrink-0 text-golden" />Every bite fuels a brighter you. Thank you for eating with Campus Delight — we're honoured to feed the future.</p>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline" size="lg"><Link to="/history" onClick={onClose}>View my orders</Link></Button>
              <Button size="lg" onClick={onClose}>Order something else</Button>
            </div>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
