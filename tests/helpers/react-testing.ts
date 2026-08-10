import { JSDOM } from "jsdom";
import { act } from "react";
import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let dom: JSDOM | null = null;
let root: Root | null = null;
let rootContainer: HTMLElement | null = null;

const saved: Record<string, unknown> = {};

const KEYS_TO_SWAP = [
	"window",
	"document",
	"navigator",
	"HTMLElement",
	"SVGElement",
	"Node",
	"customElements",
	"getComputedStyle",
	"Event",
	"CustomEvent",
	"MutationObserver",
	"ResizeObserver",
	"IntersectionObserver",
] as const;

export { act };

export function setupDOM(): void {
	if (dom) dom.window.close();

	dom = new JSDOM(
		'<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>',
		{ url: "http://localhost:3000/" },
	);

	for (const key of KEYS_TO_SWAP) {
		if (key in globalThis) {
			saved[key] = (globalThis as Record<string, unknown>)[key];
		}
	}

	(globalThis as Record<string, unknown>).window = dom.window;
	(globalThis as Record<string, unknown>).document = dom.window.document;
	(globalThis as Record<string, unknown>).navigator = dom.window.navigator;
	(globalThis as Record<string, unknown>).HTMLElement = dom.window.HTMLElement;
	(globalThis as Record<string, unknown>).SVGElement = dom.window.SVGElement;
	(globalThis as Record<string, unknown>).Node = dom.window.Node;
	(globalThis as Record<string, unknown>).customElements =
		dom.window.customElements;
	(globalThis as Record<string, unknown>).getComputedStyle =
		dom.window.getComputedStyle.bind(dom.window);
	(globalThis as Record<string, unknown>).Event = dom.window.Event;
	(globalThis as Record<string, unknown>).CustomEvent = dom.window.CustomEvent;
	(globalThis as Record<string, unknown>).MutationObserver =
		dom.window.MutationObserver;
	(globalThis as Record<string, unknown>).ResizeObserver =
		dom.window.ResizeObserver ||
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	(globalThis as Record<string, unknown>).IntersectionObserver =
		dom.window.IntersectionObserver ||
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};

	(dom.window as Record<string, unknown>).turnstile = undefined;
	(dom.window as Record<string, unknown>).grecaptcha = undefined;
	(dom.window as Record<string, unknown>).hcaptcha = undefined;
}

export function cleanupDOM(): void {
	if (root) {
		act(() => {
			root.unmount();
		});
		root = null;
	}
	rootContainer = null;

	if (dom) {
		dom.window.close();
		dom = null;
	}

	for (const key of KEYS_TO_SWAP) {
		if (key in saved) {
			(globalThis as Record<string, unknown>)[key] = saved[key];
		} else {
			delete (globalThis as Record<string, unknown>)[key];
		}
	}
	for (const key of Object.keys(saved)) {
		delete saved[key];
	}
}

export function render(element: ReactNode): {
	container: HTMLElement;
	unmount: () => void;
} {
	if (root) {
		act(() => {
			root.unmount();
		});
	}

	rootContainer = document.createElement("div");
	document.body.appendChild(rootContainer);

	root = createRoot(rootContainer);

	act(() => {
		root.render(element);
	});

	const currentRoot = root;
	return {
		container: rootContainer,
		unmount: () => {
			if (currentRoot) {
				act(() => {
					currentRoot.unmount();
				});
			}
		},
	};
}

export async function renderAsync(
	element: ReactNode,
): Promise<{
	container: HTMLElement;
	unmount: () => void;
}> {
	if (root) {
		await act(async () => {
			root.unmount();
		});
	}

	rootContainer = document.createElement("div");
	document.body.appendChild(rootContainer);

	root = createRoot(rootContainer);

	await act(async () => {
		root.render(element);
	});

	const currentRoot = root;
	return {
		container: rootContainer,
		unmount: () => {
			if (currentRoot) {
				act(() => {
					currentRoot.unmount();
				});
			}
		},
	};
}

export async function flushPromises(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => queueMicrotask(resolve));
	});
}

export function getScriptElement(id: string): HTMLElement | null {
	return document.getElementById(id);
}

export function triggerScriptLoad(scriptId: string): void {
	const script = document.getElementById(scriptId);
	if (script && typeof (script as HTMLScriptElement).onload === "function") {
		(script as HTMLScriptElement).onload!(null as unknown as Event);
	}
}

export function triggerScriptError(scriptId: string): void {
	const script = document.getElementById(scriptId);
	if (script && typeof (script as HTMLScriptElement).onerror === "function") {
		(script as HTMLScriptElement).onerror!(new Event("error"));
	}
}
