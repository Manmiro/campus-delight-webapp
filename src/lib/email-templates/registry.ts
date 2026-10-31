import type { ComponentType } from 'react'
import { template as transactionReceipt } from './transaction-receipt'
import { template as birthdayGreeting } from './birthday-greeting'
import { template as loanReminder } from './loan-reminder'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'transaction-receipt': transactionReceipt,
  'birthday-greeting': birthdayGreeting,
  'loan-reminder': loanReminder,
}
