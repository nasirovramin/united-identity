import { TheBrandIdentitySource } from "./the-brand-identity.js";

export const WEB_SOURCES=[
  new TheBrandIdentitySource()
];

export const TELEGRAM_SOURCES=[];
export const ALL_SOURCES=[...WEB_SOURCES,...TELEGRAM_SOURCES];
