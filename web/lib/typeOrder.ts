// Equipment types in BuildingStart's order, with all sub-items right after Roof Top Units.
// Types not listed (added later) go at the end, alphabetically.
export const TYPE_ORDER = [
  "ahu",              // Air Handling Unit
  "mau",              // Make-Up Air Unit
  "rtu",              // Roof Top Unit
  "fan_sub",          // sub-items
  "chw_coil_sub",
  "hw_coil_sub",
  "dx_coil_sub",
  "edh_sub",
  "filter_sub",
  "exhaust_fan",      // Fan Unit
  "toilet_exhaust",   // Toilet Exhaust Fan
  "fcu",              // Fan Coil
  "ductless",         // Ductless Split System
  "split",            // Split System
  "wshp",             // Water Source Heat Pump
  "coil_test",        // Coil Test
  "duct_traverse",    // Duct Traverse
  "face_velocity",    // Face Velocity Test
  "vav",              // Terminal Unit
  "vav_electric_heat",// Electric Coil (under a Terminal Unit)
  "temp_sensor",      // Temp / Hum Sensor
  "flow_sensor",      // Flow Sensor
  "pressure_sensor",  // Pressure Sensor
  "unit_heater",      // Unit Heater
  "pump",             // Hydronic Pump
  "chiller",          // Chiller Test
  "cooling_tower",    // Cooling Tower
  "boiler",           // Boiler
  "ach",              // ACH / Pressurization
  "autoflow_valve",   // Autoflow Valve
];

export function byTypeOrder<T extends { key: string; name: string }>(a: T, b: T): number {
  const ia = TYPE_ORDER.indexOf(a.key), ib = TYPE_ORDER.indexOf(b.key);
  if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  return a.name.localeCompare(b.name);
}
