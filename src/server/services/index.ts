import "server-only";

import { fixtureServices, type Services } from "@/contracts/services";

/**
 * The services every lane calls (architecture 4.2 rule 3). This starts on the fixture
 * implementation from the contracts; Lane A switches this one line to the real
 * services in the 10:45 batch. Callers see only the `Services` interface.
 */
export const services: Services = fixtureServices;

export type { Services };
