"use client";

import { createContext, useContext } from "react";

/**
 * Whether to show integration details (clinical codes, rule ids, API trace). Off by default so the
 * app reads plainly; on for anyone who wants to see how OntoMorph and HOLON are used.
 */
export const TechContext = createContext(false);
export const useTech = () => useContext(TechContext);
