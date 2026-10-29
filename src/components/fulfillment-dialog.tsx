import { useState } from 'react';
import { ArrowRight, Bike, Check, MapPin, Pencil, ShoppingBasket, Wallet } from 'lucide-react';
import logo from '@/assets/logo.jpg';
import heroMeal from '@/assets/hero-meal.jpg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { naira } from '@/lib/format';

type Props = {
  open: boolean; onOpenChange: (open: boolean) => void;
  outletName: string; feeKobo: number; foodKobo: number; totalKobo: number;
  fulfillment: 'delivery' | 'pickup' | null; onChoose: (choice: 'delivery' | 'pickup') => void;
  address: string; onAddress: (address: string) => void;
  paymentStep: boolean; onContinue: () => void; onPay: () => void; onBack: () => void;
  pending: boolean; canPay: boolean; subscription: boolean; creditTotal?: number | undefined;
  paymentOptions: { value: string; label: string; disabled: boolean }[]; method: string; onMethod: (method: string) => void;
};

export function FulfillmentDialog(p: Props) {
  const [deliveryStep, setDeliveryStep] = useState<'choice' | 'address' | 'review'>('choice');
  const addressValid = p.address.trim().length >= 5 && p.address.trim().length <= 500;
  const showChoice = !p.paymentStep && deliveryStep === 'choice';
  const showAddress = !p.paymentStep && deliveryStep === 'address';
  const showReview = !p.paymentStep && deliveryStep === 'review';
  const goBack = () => { setDeliveryStep('choice'); p.onBack(); };
  const continueCheckout = () => {
    if (showChoice && p.fulfillment === 'delivery') setDeliveryStep('address');
    else if (showAddress && addressValid) setDeliveryStep('review');
    else if (p.fulfillment === 'pickup' || (showReview && addressValid)) p.onContinue();
  };
  return <Dialog open={p.open} onOpenChange={(open) => { if (!p.pending) { setDeliveryStep('choice'); p.onOpenChange(open); } }}>
    <DialogContent className="gap-0 overflow-hidden p-0 sm:p-0 motion-reduce:animate-none">
      <div className="relative overflow-hidden bg-primary px-6 pb-6 pt-7 text-primary-foreground">
        <img src={heroMeal} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" />
        <div className="relative">
          <div className="flex items-center gap-2"><img src={logo} alt="Campus Delight" className="h-10 w-10 rounded-full" /><span className="text-sm font-bold">Campus Delight</span></div>
          <p className="mt-4 text-xs font-semibold uppercase">{p.paymentStep ? 'Almost time to feast' : showAddress ? 'Your delivery address' : showReview ? 'Check your destination' : 'Your cravings, your way'}</p>
          <DialogTitle className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-normal">{p.paymentStep ? 'One last bite-sized step.' : showAddress ? 'Where are we headed?' : showReview ? 'The right place. A great meal.' : 'Bring it to me. Or meet me there.'}</DialogTitle>
          <DialogDescription className="mt-2 text-primary-foreground/90">{p.paymentStep ? 'Review your total and choose how to pay.' : showAddress ? 'Tell us exactly where to bring your order.' : showReview ? 'Confirm your delivery address before payment.' : 'Choose delivery or collect your food at the outlet.'}</DialogDescription>
        </div>
      </div>
      <div className="max-h-[65dvh] space-y-4 overflow-y-auto p-5 sm:p-6">
        {showChoice && <>
          <div role="radiogroup" aria-label="Delivery or pickup" className="grid grid-cols-2 gap-3">
            {(['delivery', 'pickup'] as const).map((choice) => {
              const selected = p.fulfillment === choice;
              const Icon = choice === 'delivery' ? Bike : ShoppingBasket;
              return <Button key={choice} variant="outline" role="radio" aria-checked={selected} onClick={() => p.onChoose(choice)} className={`relative h-auto min-h-40 flex-col items-start justify-start whitespace-normal rounded-lg p-4 text-left transition-all motion-reduce:transition-none ${selected ? 'border-primary bg-primary/10 ring-2 ring-primary/25' : 'bg-card hover:border-primary'}`}>
                <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-primary"><Icon className={`h-7 w-7 ${selected ? 'animate-wiggle motion-reduce:animate-none' : ''}`} /></span>
                {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
                <span className="mt-2 font-display text-lg font-bold">{choice === 'delivery' ? 'Delivery' : 'Pickup'}</span>
                <span className="text-base font-bold text-primary">{choice === 'delivery' ? naira(p.feeKobo) : 'Free'}</span>
                <span className="text-xs font-normal text-muted-foreground">{choice === 'delivery' ? 'Good food, brought to you.' : 'Come to the outlet to collect.'}</span>
              </Button>;
            })}
          </div>
          {p.fulfillment === 'pickup' && <p className="flex items-start gap-2 text-sm"><MapPin className="h-5 w-5 shrink-0 text-primary" />Collect your order at {p.outletName}.</p>}
        </>}
        {showAddress && <div className="animate-in fade-in slide-in-from-right-2 motion-reduce:animate-none">
          <Label htmlFor="delivery-address">Delivery address</Label>
          <Input id="delivery-address" autoFocus autoComplete="street-address" className="mt-2" placeholder="Hostel, room number, street or landmark" minLength={5} maxLength={500} value={p.address} onChange={(e) => p.onAddress(e.target.value)} aria-describedby="delivery-address-hint" />
          <p id="delivery-address-hint" className="mt-2 text-xs text-muted-foreground">Include your hostel or building, room number and a nearby landmark. At least 5 characters.</p>
        </div>}
        {(showReview || (p.paymentStep && p.fulfillment === 'delivery')) && <section className="animate-in fade-in slide-in-from-bottom-2 border-l-4 border-primary bg-accent/50 p-4 motion-reduce:animate-none" aria-label="Delivery address review">
          <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-bold"><MapPin className="h-5 w-5 shrink-0 text-primary" />Deliver to</h2><Button variant="ghost" size="sm" disabled={p.pending} onClick={() => { p.onBack(); setDeliveryStep('address'); }}><Pencil className="h-3 w-3" />Edit</Button></div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{p.address.trim()}</p>
          <p className="mt-2 text-xs text-muted-foreground">From {p.outletName}</p>
        </section>}
        {p.paymentStep && <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2">
          {p.paymentOptions.map((o) => <Button key={o.value} variant="outline" role="radio" aria-checked={p.method === o.value} disabled={o.disabled || p.pending} onClick={() => p.onMethod(o.value)} className={`h-auto min-h-16 whitespace-normal justify-start text-left text-xs ${p.method === o.value ? 'border-primary bg-primary/10 ring-2 ring-primary/25' : ''}`}>{o.label}</Button>)}
        </div>}
        <dl className="space-y-2 border-y border-border py-3 text-sm">
          <div className="flex justify-between gap-2"><dt>Food</dt><dd>{p.subscription ? 'Covered by your meal plan' : naira(p.foodKobo)}</dd></div>
          <div className="flex justify-between"><dt>{p.fulfillment === 'pickup' ? 'Pickup' : 'Delivery fee'}</dt><dd>{naira(p.fulfillment === 'delivery' ? p.feeKobo : 0)}</dd></div>
          <div className="flex justify-between font-display text-xl font-bold"><dt>Total</dt><dd className="text-primary">{naira(p.totalKobo)}</dd></div>
          {p.creditTotal !== undefined && <div className="flex justify-between text-xs"><dt>Total repayable, including term charge</dt><dd>{naira(p.creditTotal)}</dd></div>}
        </dl>
        {p.subscription && p.fulfillment === 'delivery' && <p className="flex items-start gap-2 text-xs text-muted-foreground"><Wallet className="h-4 w-4 shrink-0" />Your meal plan covers the food. The delivery fee comes from your cash wallet.</p>}
        {p.paymentStep && !p.canPay && <p role="alert" className="text-sm text-destructive">Choose an available payment method, top up your wallet, or go back for free pickup.</p>}
        <Button className="w-full" size="lg" disabled={p.paymentStep ? !p.canPay || p.pending || (p.fulfillment === 'delivery' && !addressValid) : !p.fulfillment || ((showAddress || showReview) && !addressValid)} onClick={p.paymentStep ? p.onPay : continueCheckout}>{p.pending ? 'Placing your order…' : p.paymentStep ? 'Pay & place order' : showAddress ? 'Review delivery address' : showChoice && p.fulfillment === 'delivery' ? 'Enter delivery address' : 'Continue to payment'}<ArrowRight className="ml-2 h-4 w-4" /></Button>
        {(p.paymentStep || !showChoice) && <Button variant="ghost" className="w-full" disabled={p.pending} onClick={goBack}>Change delivery / pickup</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}