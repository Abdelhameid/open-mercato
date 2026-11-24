import { asFunction, asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { TransportVehicle, TransportRoute, TransportTripSchedule } from './data/entities'
import { createTransportService } from './lib/transportService'

export function register(container: AppContainer) {
  container.register({
    TransportVehicle: asValue(TransportVehicle),
    TransportRoute: asValue(TransportRoute),
    TransportTripSchedule: asValue(TransportTripSchedule),
    transportService: asFunction(createTransportService).scoped(),
  })
}
