import { Effect } from "effect"
import {
  AIError,
  type HttpOptions,
  type ModelID,
  ProviderID,
  type ProviderOptions,
  UnsupportedOperationError,
} from "../schema/index.js"
import type { ProviderPackage } from "../provider-package.js"
import { AuthOptions, type ProviderAuthOption } from "../route/auth-options.js"
import { DecisionRoute } from "../route/decision.js"
import { Endpoint } from "../route/endpoint.js"
import { SystemOne } from "../protocols/system-one.js"
import { toConfig } from "./settings.js"

export const id = ProviderID.make("nace")
const baseURL = "https://console.nace.ai/v1"

/** Nace maps the name before the slash to a traffic channel, so it is fixed for this adapter. */
const client = "opencode-nace/1"

export type Config = ProviderAuthOption<"optional"> & {
  readonly baseURL?: string
  readonly headers?: Record<string, string>
  readonly http?: HttpOptions
}

export type Settings = ProviderPackage.Settings & { readonly apiKey?: string | false }

// Drex Max reads PNG, JPEG and WebP from the root `images` list. Nace ignores unknown root keys, so audio and video
// would be dropped without an error if the shared encoder placed them.
const protocol = DecisionRoute.protocol({
  ...SystemOne.protocol,
  body: {
    from: Effect.fnUntraced(function* (request) {
      const other = request.input.find((part) => part.type === "media" && part.media.kind !== "image")
      if (other?.type === "media")
        return yield* new AIError({
          reason: new UnsupportedOperationError({
            operation: "decision.media",
            provider: request.model.provider,
            route: request.model.route.id,
            message: `Nace takes images in decisions; got ${other.media.mediaType}`,
          }),
        })
      return { ...(yield* SystemOne.encodeBody(request, "root")), model: request.model.id }
    }),
  },
})

export const configure = (input: Config = {}) => {
  const route = DecisionRoute.make({
    id: "system-one",
    provider: id,
    providerMetadataKey: "nace",
    protocol,
    endpoint: Endpoint.path("/systemone", { baseURL: input.baseURL ?? baseURL }),
    auth: AuthOptions.bearer(input, "NACE_API_KEY"),
    headers: { "X-Nace-Client": client, ...input.headers },
    http: input.http,
  })
  const decision = (modelID: string | ModelID, providerOptions?: ProviderOptions) =>
    route.model({ id: modelID, providerOptions })
  return { id, decision, configure }
}

export const provider = configure()
export const decision = provider.decision

export const decisionModel = (modelID: string, settings?: Settings) => {
  const input = toConfig(settings)
  return configure(input).decision(modelID, input.providerOptions)
}

export * as Nace from "./nace.js"
