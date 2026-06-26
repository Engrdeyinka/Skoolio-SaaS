/**
 * brand.js - White-label configuration (single source of truth).
 *
 * SaaS model: one instance per school. To rebrand this deployment for a new
 * school, edit ONLY this file (and the school's own details inside the app via
 * Settings > School Info). The defaults below match the original TUNMISE
 * instance so existing behaviour is unchanged.
 *
 * Notes:
 *  - schoolName here is only a FALLBACK. The live display name comes from
 *    Settings > School Info (school_settings.school_name) at runtime.
 *  - smsSenderId must be a sender ID registered with your SMS provider/telco.
 *  - shortCode is used in SMS signatures, student login codes and payment refs.
 */
export const BRAND = {
  // Product / platform identity (marketing surfaces, page titles)
  appName: "Skoolio",
  platformName: "Skoolio School Management Platform",

  // Fallback school display name (used only when Settings has none set)
  schoolName: "Tunmise Overcomer Private School",

  // Short code: SMS signature, student login scheme, payment reference prefix
  shortCode: "TOPS",

  // SMS sender ID registered with the telco / SMS gateway
  smsSenderId: "Tunmisesch",
};

// Convenience: uppercased school name for letterheads / receipts
export const BRAND_SCHOOL_UPPER = BRAND.schoolName.toUpperCase();
