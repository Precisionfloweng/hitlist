# Hitlist rules

Which BuildingStart fields each equipment type needs. ✖ Required fields count toward completion %; ⚠ Optional fields show as warnings only. Seeded from the Macro Scheduler scripts; these will be editable in the web app.

Source: Seeded from the Macro Scheduler equipment scripts, 2026-09-26

## AHUs

Export sheet: **Air Handling Unit**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Manufacturer | ✖ Required | Unit Manufacturer |  |
| Model | ✖ Required | Unit Model Number |  |
| Serial | ✖ Required | Unit Serial Number |  |
| Design Airflow | ⚠ Optional | Design Airflow |  |
| Actual Airflow | ✖ Required | Actual Airflow |  |
| Des Outlet Total | ⚠ Optional | Design Outlet Total |  |
| Act Outlet Total | ✖ Required | Actual Outlet Total |  |
| Design O/A | ⚠ Optional | Design Outside Airflow |  |
| Actual O/A | ✖ Required | Actual Outside Airflow |  |
| Design R/A | ⚠ Optional | Design Return Airflow |  |
| Actual R/A | ✖ Required | Actual Return Airflow |  |
| Design Fan RPM | ⚠ Optional | Design Fan RPM |  |
| Actual Fan RPM | ✖ Required | Actual Fan RPM |  |
| Design Total SP | ⚠ Optional | Design Total SP |  |
| Actual Total SP | ✖ Required | Actual Total SP |  |
| Design External SP | ⚠ Optional | Design External SP |  |
| Actual External SP | ✖ Required | External SP |  |
| Supply Duct SP Stpt | ⚠ Optional | Supply DSP Setpoint |  |
| O/A Damper Position | ⚠ Optional | O/A Damper Position |  |
| R/A Damper Position | ⚠ Optional | R/A Damper Position |  |
| Unit Location | ⚠ Optional | Unit Location |  |
| Area Served | ⚠ Optional | Area Served |  |
| VFD Setting | ⚠ Optional | Final VFD Setting |  |
| Motor Make | ✖ Required | Motor Make |  |
| HP | ✖ Required | Horse Power |  |
| Motor Rated KW | ⚠ Optional | Motor Rated KW |  |
| Nom. Eff. | ✖ Required | Nominal Efficiency |  |
| PF | ✖ Required | Power Factor |  |
| Frame | ✖ Required | Frame |  |
| RPM | ✖ Required | Motor RPM |  |
| Volts | ✖ Required | Voltage |  |
| Phase | ✖ Required | Motor Phase |  |
| Hertz | ✖ Required | Motor Hertz |  |
| Amps | ✖ Required | Amps |  |
| Service Factor | ✖ Required | Service Factor |  |
| Fan Wall Array | ⚠ Optional | Fan Wall Array |  |
| Sheave MFG | ✖ Required | Motor Sheave MFG | Drive Type = Belt Drive |
| Sheave Model | ✖ Required | Motor Sheave Model | Drive Type = Belt Drive |
| Sheave Diam. | ✖ Required | Motor Sheave Diam. | Drive Type = Belt Drive |
| Sheave Bore | ✖ Required | Motor Sheave Bore | Drive Type = Belt Drive |
| Fan Sheave MFG | ✖ Required | Fan Sheave MFG | Drive Type = Belt Drive |
| Fan Sheave Model | ✖ Required | Fan Sheave Model | Drive Type = Belt Drive |
| Fan Sheave Diam. | ✖ Required | Fan Sheave Diam. | Drive Type = Belt Drive |
| Fan Sheave Bore | ✖ Required | Fan Sheave Bore | Drive Type = Belt Drive |
| Belts | ✖ Required | Number of Belts | Drive Type = Belt Drive |
| Belt Size | ✖ Required | Belt Size | Drive Type = Belt Drive |
| Centerline | ✖ Required | Sheave Center Line | Drive Type = Belt Drive |
| Drive Type | ✖ Required | Drive Type |  |
| Actual Volts | ✖ Required | Motor Volts T2-T3 / Motor Volts T1-T3 / Motor Volts T1-T2 |  |
| Actual Amps | ✖ Required | Motor Amps T1 / Motor Amps T2 / Motor Amps T3 |  |
| # of Motors/Fans | ⚠ Optional | Number of Motors/Fans |  |
| Filter MFG | ✖ Required | Filter Manufacturer |  |
| Filter Type | ✖ Required | Filter Type |  |
| Filter Rating | ✖ Required | Filter Rating |  |
| Qty S1 | ✖ Required | Filter Qty - S1 |  |
| Size S1 | ✖ Required | Filter Size - S1 |  |

## RTUs

Export sheet: **Roof Top Unit**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Design Airflow | ⚠ Optional | Design Airflow |  |
| Actual Airflow | ✖ Required | Actual Airflow |  |
| Design O/A | ⚠ Optional | Design Outside Airflow |  |
| Actual O/A | ✖ Required | Actual Outside Airflow |  |
| Design T.S.P. | ⚠ Optional | Design T.S.P. |  |
| Actual T.S.P. | ✖ Required | Actual T.S.P. |  |
| Design E.S.P. | ⚠ Optional | Design E.S.P. |  |
| Actual E.S.P. | ✖ Required | Actual E.S.P. |  |
| Design RPM | ⚠ Optional | Design Fan RPM |  |
| Actual Fan RPM | ✖ Required | Actual Fan RPM |  |
| Design R/A | ⚠ Optional | Design Return Airflow |  |
| Actual R/A | ✖ Required | Actual Return Airflow |  |
| O/A Damper Position | ⚠ Optional | O/A Damper Position |  |
| Location | ✖ Required | Location |  |
| Area Served | ⚠ Optional | Area Served |  |
| Motor Make | ✖ Required | Motor Make |  |
| HP | ✖ Required | Horse Power |  |
| Nom. Eff. | ✖ Required | Nominal Efficiency |  |
| PF | ✖ Required | Power Factor |  |
| RPM | ✖ Required | Motor RPM |  |
| Voltage | ✖ Required | Voltage |  |
| Amps | ✖ Required | Amps |  |
| Phase | ✖ Required | Motor Phase |  |
| Hertz | ✖ Required | Motor Hertz |  |
| S.F. | ✖ Required | Service Factor |  |
| Design Outlet CFM | ⚠ Optional | Design Outlet Total Airflow |  |
| VFD Setting | ⚠ Optional | Final VFD Setting |  |
| MFG | ✖ Required | Manufacturer |  |
| Model | ✖ Required | Unit Model Number |  |
| Serial | ✖ Required | Unit Serial Number |  |
| Sheave MFG | ✖ Required | Motor Sheave MFG | Drive Type = Belt Drive |
| Sheave Model | ✖ Required | Motor Sheave Model | Drive Type = Belt Drive |
| Sheave Dia. | ✖ Required | Motor Sheave Diam. | Drive Type = Belt Drive |
| Sheave Bore | ✖ Required | Motor Sheave Bore | Drive Type = Belt Drive |
| Fan Sheave MFG | ✖ Required | Fan Sheave MFG | Drive Type = Belt Drive |
| Fan Sheave Model | ✖ Required | Fan Sheave Model | Drive Type = Belt Drive |
| Fan Sheave Diameter | ✖ Required | Fan Sheave Diam. | Drive Type = Belt Drive |
| Fan Sheave Bore | ✖ Required | Fan Sheave Bore | Drive Type = Belt Drive |
| Belts | ✖ Required | Number of Belts | Drive Type = Belt Drive |
| Belt Size | ✖ Required | Belt Size | Drive Type = Belt Drive |
| Centerline | ✖ Required | Sheave Center Line | Drive Type = Belt Drive |
| Volts T1 | ✖ Required | Motor Volts T1-T2 / Motor Volts T2-T3 / Motor Volts T1-T3 |  |
| Amps T1 | ✖ Required | Motor Amps T1 / Motor Amps T2 / Motor Amps T3 |  |
| Frame | ✖ Required | Frame |  |
| Filter Type | ✖ Required | Filter Type |  |
| Qty S1 | ✖ Required | Filter Qty - S1 |  |
| Size S1 | ✖ Required | Filter Size - S1 |  |
| Drive Type | ✖ Required | Drive Type |  |
| Operating Dia. | ✖ Required | Motor Sheave O.D. | Drive Type = Belt Drive |
| # of Motors/Fans | ⚠ Optional | No. of Motors/fans |  |
| Final OA % Diff. | ⚠ Optional | Final OA % Diff. |  |
| Economizer Operation | ⚠ Optional | Economizer Operation Verified |  |
| Relief Operation | ⚠ Optional | Relief Operation Verified |  |
| Filter Rating | ⚠ Optional | Filter Rating |  |
| # of Compressors | ⚠ Optional | # of Compressors |  |
| Compressor Stages Verified | ⚠ Optional | All compressor stages verified |  |
| Actual Outlet Total Flow | ✖ Required | Actual Outlet Total Flow |  |
| Outlet Flow % | ⚠ Optional | Outlet Flow % |  |

## Exhaust Fans

Export sheet: **Fan Unit**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Design Airflow | ⚠ Optional | Fan Design Airflow |  |
| Actual Airflow | ✖ Required | Fan Actual Airflow |  |
| Design RPM | ⚠ Optional | Design RPM |  |
| Actual RPM | ✖ Required | Actual RPM |  |
| Design Total Static Pressure | ⚠ Optional | Design E.S.P. |  |
| Actual Total Static Pressure | ✖ Required | Actual E.S.P. |  |
| Suction Static | ✖ Required | Suction SP |  |
| Discharge Static | ✖ Required | Discharge SP |  |
| Fan Serial | ✖ Required | Fan Serial Number |  |
| Fan MFG | ✖ Required | Fan Manufacturer |  |
| Fan Model | ✖ Required | Fan Model Number |  |
| Motor MFG | ✖ Required | Motor Manufacturer |  |
| HP | ✖ Required | Motor HP |  |
| Frame | ✖ Required | Motor Frame |  |
| Motor RPM | ✖ Required | Motor RPM |  |
| Design Volts | ✖ Required | Motor Rated Volts |  |
| Motor Phase | ✖ Required | Motor Phase |  |
| Hertz | ✖ Required | Motor Hertz |  |
| Design Motor Amps | ✖ Required | Motor FL Amps |  |
| Service Factor | ✖ Required | Motor Service Factor |  |
| Motor Eff | ✖ Required | Nominal Efficiency |  |
| Power Factor | ✖ Required | Power Factor |  |
| Motor Sheave MFG | ✖ Required | Motor Sheave MFG | Drive Type = Belt Drive |
| Motor Sheave Model | ✖ Required | Motor Sheave Model | Drive Type = Belt Drive |
| Motor Sheave Dia | ✖ Required | Motor Sheave Diam. | Drive Type = Belt Drive |
| Motor Sheave Bore | ✖ Required | Motor Sheave Bore | Drive Type = Belt Drive |
| Fan Sheave MFG | ✖ Required | Fan Sheave MFG | Drive Type = Belt Drive |
| Fan Sheave Model | ✖ Required | Fan Sheave Model | Drive Type = Belt Drive |
| Fan Sheave Dia | ✖ Required | Fan Sheave Diam. | Drive Type = Belt Drive |
| Fan Sheave Bore | ✖ Required | Fan Sheave Bore | Drive Type = Belt Drive |
| # of Belts | ✖ Required | Number of Belts | Drive Type = Belt Drive |
| Belt Size | ✖ Required | Belt Size | Drive Type = Belt Drive |
| Centerline Distance | ✖ Required | Sheave Center Line | Drive Type = Belt Drive |
| Actual Volts | ✖ Required | Motor Volts T1-T2 / Motor Volts T1-T3 / Motor Volts T2-T3 |  |
| Actual Amps | ✖ Required | Motor Amps T1 / Motor Amps T2 / Motor Amps T3 |  |
| VFD Setting | ✖ Required | Final VFD Setting |  |
| Drive Type | ✖ Required | Drive Type |  |
| Operating Diameter | ✖ Required | Operating Diameter | Drive Type = Belt Drive |
| Speed Control Setting | ⚠ Optional | Speed Control Setting |  |

## FCUs

Export sheet: **Fan Coil Unit *(sheet name not yet confirmed)***

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Design Airflow | ⚠ Optional | *(matched automatically)* |  |
| Actual Airflow | ✖ Required | *(matched automatically)* |  |
| Design O/A | ✖ Required | *(matched automatically)* |  |
| Actual O/A | ✖ Required | *(matched automatically)* |  |
| Design T.S.P. | ⚠ Optional | *(matched automatically)* |  |
| Actual T.S.P. | ✖ Required | *(matched automatically)* |  |
| Design E.S.P. | ⚠ Optional | *(matched automatically)* |  |
| Actual E.S.P. | ✖ Required | *(matched automatically)* |  |
| Design RPM | ⚠ Optional | *(matched automatically)* |  |
| Actual Fan RPM | ✖ Required | *(matched automatically)* |  |
| Design Outlet CFM | ⚠ Optional | *(matched automatically)* |  |
| MFG | ✖ Required | *(matched automatically)* |  |
| Model | ✖ Required | *(matched automatically)* |  |
| Serial | ✖ Required | *(matched automatically)* |  |
| VFD Setting | ⚠ Optional | *(matched automatically)* |  |
| Fan Speed Setting | ⚠ Optional | *(matched automatically)* |  |
| Filter Type | ✖ Required | *(matched automatically)* |  |
| Qty S1 | ✖ Required | *(matched automatically)* |  |
| Size S1 | ✖ Required | *(matched automatically)* |  |
| Motor Make | ✖ Required | *(matched automatically)* |  |
| Motor Type | ✖ Required | *(matched automatically)* |  |
| Frame | ✖ Required | *(matched automatically)* |  |
| HP | ✖ Required | *(matched automatically)* |  |
| RPM | ✖ Required | *(matched automatically)* |  |
| Voltage | ✖ Required | *(matched automatically)* |  |
| Phase | ✖ Required | *(matched automatically)* |  |
| Hertz | ✖ Required | *(matched automatically)* |  |
| Amps | ✖ Required | *(matched automatically)* |  |
| S.F. | ✖ Required | *(matched automatically)* |  |
| Nom. Eff. | ✖ Required | *(matched automatically)* |  |
| PF | ✖ Required | *(matched automatically)* |  |
| Sheave MFG | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Sheave Model | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Sheave Dia. | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Sheave Bore | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Fan Sheave MFG | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Fan Sheave Model | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Fan Sheave Diameter | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Fan Sheave Bore | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Belts | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Belt Size | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Centerline | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Volts T1 | ✖ Required | *(matched automatically)* |  |
| Amps T1 | ✖ Required | *(matched automatically)* |  |
| Operating Dia. | ✖ Required | *(matched automatically)* | Motor Type = Belt Drive |
| Location | ⚠ Optional | *(matched automatically)* |  |
| Area Served | ⚠ Optional | *(matched automatically)* |  |
| Heating EAT | ✖ Required | *(matched automatically)* |  |
| Heating LAT | ✖ Required | *(matched automatically)* |  |

## Ductless

Export sheet: **Ductless Split System**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Design Airflow | ⚠ Optional | Design Airflow |  |
| Actual Airflow | ✖ Required | Actual Airflow |  |
| Fan Speed Setting | ⚠ Optional | Fan Speed - Final |  |
| Design EAT DB | ⚠ Optional | Des. E.A.T. DB |  |
| Actual EAT DB | ✖ Required | Act. E.A.T. DB |  |
| Design EAT WB | ⚠ Optional | Des. E.A.T. WB |  |
| Actual EAT WB | ✖ Required | Act. E.A.T. WB |  |
| Design LAT DB | ⚠ Optional | Des. L.A.T. DB |  |
| Actual LAT DB | ✖ Required | Act. L.A.T DB |  |
| Design LAT WB | ⚠ Optional | Des. L.A.T. WB |  |
| Actual LAT WB | ✖ Required | Act. L.A.T. WB |  |
| Design EAT Heating | ⚠ Optional | Des. E.A.T. Heating |  |
| Actual EAT Heating | ✖ Required | Act. Heating E.A.T |  |
| Location | ⚠ Optional | Location |  |
| Area Served | ⚠ Optional | Serves |  |
| MFG | ✖ Required | Unit Manufacturer |  |
| Model | ✖ Required | Unit Model Number |  |
| Serial | ✖ Required | Unit Serial Number |  |
| Amps | ✖ Required | Motor FL Amps |  |
| Motor Make | ✖ Required | Motor Manufacturer |  |
| HP | ✖ Required | Motor HP |  |
| Frame | ✖ Required | Motor Frame |  |
| Voltage | ✖ Required | Motor Rated Volts |  |
| Phase | ✖ Required | Motor Phase |  |
| Hertz | ✖ Required | Motor Hertz |  |
| RPM | ✖ Required | Motor RPM |  |
| S.F. | ✖ Required | Motor Service Factor |  |
| Nom. Eff. | ✖ Required | Nominal Efficiency |  |
| PF | ✖ Required | Power Factor |  |
| Design LAT Heating | ⚠ Optional | Des. L.A.T. Heating |  |
| Actual LAT Heating | ✖ Required | Act. L.A.T. Heating |  |
| Test Method | ⚠ Optional | Test Method |  |
| Area SQFT | ⚠ Optional | Area |  |
| AK | ⚠ Optional | Open Area Ak |  |
| Velocity | ⚠ Optional | Velocity |  |
| Volts T1 | ✖ Required | Volts |  |
| Amps T1 | ✖ Required | Amps |  |

## Splits

Export sheet: **Split System**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Design Airflow | ⚠ Optional | Design Airflow |  |
| Actual Airflow | ✖ Required | Actual Airflow |  |
| Design O/A | ⚠ Optional | Design Outside Air |  |
| Actual O/A | ✖ Required | Actual Outside Air |  |
| Design E.S.P. | ⚠ Optional | Design E.S.P. |  |
| Actual E.S.P. | ✖ Required | Actual E.S.P. |  |
| Design Outlet CFM | ⚠ Optional | Design Outlet Total Airflow |  |
| Actual Outlet CFM | ✖ Required | Total For Outlets |  |
| MFG | ✖ Required | Unit Manufacturer |  |
| Model | ✖ Required | Unit Model Number |  |
| Serial | ✖ Required | Unit Serial Number |  |
| Location | ⚠ Optional | Location |  |
| Area Served | ⚠ Optional | Serves |  |
| Motor Make | ✖ Required | Motor Manufacturer |  |
| Frame | ✖ Required | Motor Frame |  |
| HP | ✖ Required | Motor HP |  |
| RPM | ✖ Required | Motor RPM |  |
| Voltage | ✖ Required | Motor Rated Volts |  |
| Phase | ✖ Required | Motor Phase |  |
| Hertz | ✖ Required | Motor Hertz |  |
| Amps | ✖ Required | Motor FL Amps |  |
| S.F. | ✖ Required | Motor Service Factor |  |
| Nom. Eff. | ✖ Required | Nominal Efficiency |  |
| PF | ✖ Required | Power Factor |  |
| Design RPM | ✖ Required | Design RPM |  |
| Actual Fan RPM | ✖ Required | Actual RPM |  |
| Fan Speed Setting | ⚠ Optional | Fan Speed - Final |  |
| Volts T1 | ✖ Required | Motor Volts T1-T2 / Motor Volts T2-T3 / Motor Volts T1-T3 |  |
| Amps T1 | ✖ Required | Motor Amps T1 / Motor Amps T2 / Motor Amps T3 |  |
| Des EAT DB | ⚠ Optional | Des. E.A.T. DB |  |
| Des EAT WB | ⚠ Optional | Des. E.A.T. WB |  |
| Des LAT DB | ⚠ Optional | Des. L.A.T. DB |  |
| Des LAT WB | ⚠ Optional | Des. L.A.T. WB |  |
| Act EAT WB | ✖ Required | Act. E.A.T. WB |  |
| Act LAT WB | ✖ Required | Act. L.A.T. WB |  |
| Heating EAT | ✖ Required | Act. Heating E.A.T |  |
| Heating LAT | ✖ Required | Act. L.A.T. Heating |  |
| Filter Type | ✖ Required | Filter Type |  |
| Sheave MFG | ✖ Required | Motor Sheave MFG | Drive Type = Belt Drive |
| Sheave Model | ✖ Required | Motor Sheave Model | Drive Type = Belt Drive |
| Sheave Dia. | ✖ Required | Motor Sheave Diam. | Drive Type = Belt Drive |
| Sheave Bore | ✖ Required | Motor Sheave Bore | Drive Type = Belt Drive |
| Fan Sheave MFG | ✖ Required | Fan Sheave MFG | Drive Type = Belt Drive |
| Fan Sheave Model | ✖ Required | Fan Sheave Model | Drive Type = Belt Drive |
| Fan Sheave Diameter | ✖ Required | Fan Sheave Diam. | Drive Type = Belt Drive |
| Fan Sheave Bore | ✖ Required | Fan Sheave Bore | Drive Type = Belt Drive |
| Belts | ✖ Required | Number of Belts | Drive Type = Belt Drive |
| Belt Size | ✖ Required | Belt Size | Drive Type = Belt Drive |
| Centerline | ✖ Required | Sheave Center Line | Drive Type = Belt Drive |
| Operating Dia. | ✖ Required | Operating Diameter | Drive Type = Belt Drive |
| Act LAT DB | ✖ Required | Act. L.A.T DB |  |
| Act EAT DB | ✖ Required | Act. E.A.T. DB |  |
| Des EAT Heating | ⚠ Optional | Des. E.A.T. Heating |  |
| Des LAT Heating | ⚠ Optional | Des. L.A.T. Heating |  |
| VFD Setting | ⚠ Optional | Final VFD Setting |  |

## WSHPs

Export sheet: **Water Source Heat Pump *(sheet name not yet confirmed)***

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Design Airflow | ⚠ Optional | *(matched automatically)* |  |
| Actual Airflow | ✖ Required | *(matched automatically)* |  |
| Design O/A | ⚠ Optional | *(matched automatically)* |  |
| Actual O/A | ✖ Required | *(matched automatically)* |  |
| Design T.S.P. | ⚠ Optional | *(matched automatically)* |  |
| Actual T.S.P. | ✖ Required | *(matched automatically)* |  |
| Design E.S.P. | ⚠ Optional | *(matched automatically)* |  |
| Actual E.S.P. | ✖ Required | *(matched automatically)* |  |
| Design RPM | ⚠ Optional | *(matched automatically)* |  |
| Actual Fan RPM | ✖ Required | *(matched automatically)* |  |
| Design Outlet CFM | ⚠ Optional | *(matched automatically)* |  |
| ActOutletTotal | ✖ Required | *(matched automatically)* |  |
| MFG | ✖ Required | *(matched automatically)* |  |
| Model | ✖ Required | *(matched automatically)* |  |
| Serial | ✖ Required | *(matched automatically)* |  |
| Location | ✖ Required | *(matched automatically)* |  |
| Fan Speed | ⚠ Optional | *(matched automatically)* |  |
| Volts T1 | ✖ Required | *(matched automatically)* |  |
| Amps T1 | ✖ Required | *(matched automatically)* |  |
| VFD Setting | ⚠ Optional | *(matched automatically)* |  |
| Sheave MFG | ✖ Required | *(matched automatically)* |  |
| Sheave Model | ✖ Required | *(matched automatically)* |  |
| Sheave Dia. | ✖ Required | *(matched automatically)* |  |
| Sheave Bore | ✖ Required | *(matched automatically)* |  |
| Fan Sheave MFG | ✖ Required | *(matched automatically)* |  |
| Fan Sheave Model | ✖ Required | *(matched automatically)* |  |
| Fan Sheave Diameter | ✖ Required | *(matched automatically)* |  |
| Fan Sheave Bore | ✖ Required | *(matched automatically)* |  |
| Belts | ✖ Required | *(matched automatically)* |  |
| Belt Size | ✖ Required | *(matched automatically)* |  |
| Centerline | ✖ Required | *(matched automatically)* |  |
| Operating Dia. | ✖ Required | *(matched automatically)* |  |
| Motor Make | ✖ Required | *(matched automatically)* |  |
| Frame | ✖ Required | *(matched automatically)* |  |
| HP | ✖ Required | *(matched automatically)* |  |
| RPM | ✖ Required | *(matched automatically)* |  |
| Voltage | ✖ Required | *(matched automatically)* |  |
| Phase | ✖ Required | *(matched automatically)* |  |
| Hertz | ✖ Required | *(matched automatically)* |  |
| Amps | ✖ Required | *(matched automatically)* |  |
| S.F. | ✖ Required | *(matched automatically)* |  |
| Nom. Eff. | ⚠ Optional | *(matched automatically)* |  |
| PF | ⚠ Optional | *(matched automatically)* |  |
| Filter Rating | ⚠ Optional | *(matched automatically)* |  |
| Filter Type | ✖ Required | *(matched automatically)* |  |
| Qty S1 | ✖ Required | *(matched automatically)* |  |
| Size S1 | ✖ Required | *(matched automatically)* |  |
| Area Served | ✖ Required | *(matched automatically)* |  |
| External S.P. In | ✖ Required | *(matched automatically)* |  |
| External S.P. Out | ✖ Required | *(matched automatically)* |  |

## Coil Test

Export sheet: **Coil Test *(sheet name not yet confirmed)***

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Coil Type | ✖ Required | *(matched automatically)* |  |
| Design Capacity MBH | ⚠ Optional | *(matched automatically)* |  |
| GPM Design | ⚠ Optional | *(matched automatically)* |  |
| Press Drop Design | ⚠ Optional | *(matched automatically)* |  |
| Water Flow Actual | ✖ Required | *(matched automatically)* |  |
| Press Drop Actual | ✖ Required | *(matched automatically)* |  |
| Ent Water Temp Design | ⚠ Optional | *(matched automatically)* |  |
| Ent Water Temp Actual | ✖ Required | *(matched automatically)* |  |
| Leav Water Temp Design | ⚠ Optional | *(matched automatically)* |  |
| Leav Water Temp Actual | ✖ Required | *(matched automatically)* |  |
| Water Delta T Design | ⚠ Optional | *(matched automatically)* |  |
| Water Delta T Actual | ✖ Required | *(matched automatically)* |  |
| Face Area Sq.Ft. | ⚠ Optional | *(matched automatically)* |  |
| Airflow Design | ⚠ Optional | *(matched automatically)* |  |
| Airflow Actual | ✖ Required | *(matched automatically)* |  |
| Air Velocity Design | ⚠ Optional | *(matched automatically)* |  |
| Air Velocity Actual | ⚠ Optional | *(matched automatically)* |  |
| Ent Air DB Temp Design | ⚠ Optional | *(matched automatically)* |  |
| Ent Air DB Temp Actual | ✖ Required | *(matched automatically)* |  |
| Ent Air WB Temp Design | ⚠ Optional | *(matched automatically)* |  |
| Ent Air WB Temp Actual | ✖ Required | *(matched automatically)* |  |
| Leav Air DB Temp Design | ⚠ Optional | *(matched automatically)* |  |
| Leav Air DB Temp Actual | ✖ Required | *(matched automatically)* |  |
| Leav Air WB Temp Design | ⚠ Optional | *(matched automatically)* |  |
| Leav Air WB Temp Actual | ✖ Required | *(matched automatically)* |  |
| Air Temp Delta T Design | ⚠ Optional | *(matched automatically)* |  |
| Air Temp Delta T Actual | ✖ Required | *(matched automatically)* |  |
| Coil Inlet PSI Actual | ⚠ Optional | *(matched automatically)* |  |
| Coil Outlet PSI Actual | ⚠ Optional | *(matched automatically)* |  |
| Coil APD Design | ⚠ Optional | *(matched automatically)* |  |
| Coil APD Actual | ⚠ Optional | *(matched automatically)* |  |
| Rows | ⚠ Optional | *(matched automatically)* |  |
| Fins Per Inch | ⚠ Optional | *(matched automatically)* |  |

## VAV Electric Heat

Export sheet: **Electric Coil** · only units under: Terminal Unit

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| EDH Rated KW | ⚠ Optional | EDH Rated KW |  |
| EDH Actual KW | ✖ Required | EDH Actual KW |  |
| KW Final % | ⚠ Optional | KW% Final |  |
| Stages | ⚠ Optional | EDH Stages |  |
| Design Volts | ⚠ Optional | EDH Design Volts |  |
| Design Amps | ⚠ Optional | EDH Design Amps |  |
| Actual Volts | ✖ Required | EDH Act. Volts 1 / EDH Act. Volts 2 / EDH Act. Volts 3 |  |
| Actual Amps | ✖ Required | EDH Act. Amps 1 / EDH Act. Amps 3 / EDH Act. Amps 2 |  |
| Phase | ⚠ Optional | Phase |  |
| EAT Design | ⚠ Optional | EAT Design |  |
| LAT Design | ⚠ Optional | LAT Design |  |
| EAT Actual | ✖ Required | EAT Actual |  |
| LAT Actual | ✖ Required | LAT Actual |  |
| Delta T | ⚠ Optional | Air Temp Delta T |  |
| Airflow Design | ⚠ Optional | Airflow Design |  |
| Airflow Actual | ✖ Required | Airflow Actual |  |
| Air Temp Design Delta T | ⚠ Optional | Air Temp Design Delta T |  |

## VAVs

Export sheet: **Terminal Unit**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Unit MFG | ✖ Required | Manufacturer |  |
| Unit Model | ✖ Required | Model Number |  |
| Unit Address | ⚠ Optional | VAV Address |  |
| Inlet Size | ✖ Required | Box Inlet Size |  |
| K Factor | ✖ Required | K Factor |  |
| Design Max Airflow | ⚠ Optional | Design Max Airflow |  |
| Actual Max Airflow | ✖ Required | Actual Max Airflow |  |
| Design Min Airflow | ⚠ Optional | Design Min Airflow |  |
| Actual Min Airflow | ✖ Required | Actual Min Airflow |  |
| Design Reheat Airflow | ⚠ Optional | Design Reheat Airflow | Design Reheat Airflow > 0.5 |
| Actual Reheat Airflow | ✖ Required | Actual Reheat Airflow | Design Reheat Airflow > 0.5 |
| BAS Airflow | ✖ Required | BAS CFM |  |
| Design Fan Airflow | ⚠ Optional | Design Fan Airflow | Design Fan Airflow > 0.5 |
| Actual Fan Airflow | ✖ Required | Actual Fan Airflow | Design Fan Airflow > 0.5 |
| EDC Box Fan Setting | ⚠ Optional | EDC Box Fan Setting | Design Fan Airflow > 0.5 |
| Box Type | ⚠ Optional | Box Type |  |

## Temp Sensors

Export sheet: **Temp _ Hum Sensor**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Preliminary EMS | ✖ Required | Prelim. EMS |  |
| Preliminary Test | ✖ Required | Prelim. Test |  |
| Preliminary Diff | ⚠ Optional | Prelim. Diff. |  |
| Offset | ✖ Required | EMS Offset |  |
| Final EMS | ✖ Required | Final EMS |  |
| Final Test | ✖ Required | Final Test |  |
| Final Diff | ⚠ Optional | Final Diff. |  |
| % Diff | ⚠ Optional | % Diff. |  |

## Flow Sensors

Export sheet: **Flow Sensor**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Preliminary EMS | ✖ Required | Prelim. EMS |  |
| Preliminary Test | ✖ Required | Prelim. Test |  |
| Preliminary Diff | ⚠ Optional | Prelim. Diff. |  |
| Offset | ✖ Required | EMS Offset |  |
| Final EMS | ✖ Required | Final EMS |  |
| Final Test | ✖ Required | Final Test |  |
| Final Diff | ⚠ Optional | Final Diff. |  |
| % Diff | ⚠ Optional | % Diff. |  |
| Gain Corr. Fator | ⚠ Optional | Gain / Corr. Factor |  |

## Pressure Sensors

Export sheet: **Pressure Sensor *(sheet name not yet confirmed)***

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Preliminary EMS | ✖ Required | *(matched automatically)* |  |
| Preliminary Test | ✖ Required | *(matched automatically)* |  |
| Preliminary Diff | ⚠ Optional | *(matched automatically)* |  |
| Offset | ✖ Required | *(matched automatically)* |  |
| Final EMS | ✖ Required | *(matched automatically)* |  |
| Final Test | ✖ Required | *(matched automatically)* |  |
| Final Diff | ⚠ Optional | *(matched automatically)* |  |
| % Diff | ⚠ Optional | *(matched automatically)* |  |

## Unit Heaters

Export sheet: **Unit Heater**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| MFG | ✖ Required | Unit Manufacturer |  |
| Design Motor Volts | ⚠ Optional | Motor Volts |  |
| Design Motor Amps | ⚠ Optional | Motor Amps |  |
| Actual Motor Volts | ✖ Required | Volts 1 / Volts 2 / Volts 3 |  |
| Actual Motor Amps | ✖ Required | Amps 1 / Amps 2 / Amps 3 |  |
| Model | ✖ Required | Model Number |  |
| Serial | ✖ Required | Serial Number |  |
| Design KW | ⚠ Optional | Dsgn. KW |  |
| Actual KW | ✖ Required | Act. KW | Dsgn. KW > 0.5 |
| % Actual KW | ✖ Required | % Act. KW | Dsgn. KW > 0.5 |
| Design Heater Amps | ⚠ Optional | Dsgn. Amps | Dsgn. KW > 0.5 |
| Design Heater Volts | ⚠ Optional | Dsgn. Volts | Dsgn. KW > 0.5 |
| Actual Heater Volts | ✖ Required | Volts 1 / Volts 2 / Volts 3 | Dsgn. KW > 0.5 |
| Actual Heater Amps | ✖ Required | Amps 1 / Amps 2 / Amps 3 | Dsgn. KW > 0.5 |
| Airflow Design | ⚠ Optional | Design Airflow |  |
| Airflow Actual | ✖ Required | Actual Airflow |  |
| EAT | ✖ Required | EAT |  |
| LAT | ✖ Required | LAT |  |
| Air Delta T | ✖ Required | Delta T |  |
| Design GPM | ✖ Required | Design Waterflow | Water Delta T > 0.5 |
| Actual GPM | ✖ Required | Actual Waterflow | Design Waterflow > 0.5 |
| EWT | ✖ Required | EWT | Design Waterflow > 0.5 |
| Design DP | ⚠ Optional | Design DP | Design Waterflow > 0.5 |
| LWT | ✖ Required | LWT | Design Waterflow > 0.5 |
| Actual DP | ✖ Required | Actual DP | Design Waterflow > 0.5 |
| Motor HP | ✖ Required | Motor HP |  |

## Pumps

Export sheet: **Hydronic Pump**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Location | ✖ Required | Location |  |
| Service | ✖ Required | Service |  |
| MFG | ✖ Required | Make |  |
| Model | ✖ Required | Model |  |
| Design GPM | ⚠ Optional | Design GPM |  |
| Design Delta P | ⚠ Optional | Design Pressure Diff. |  |
| Actual GPM | ✖ Required | Actual GPM |  |
| Actual Delta P | ✖ Required | Actual RPM |  |
| Rated RPM | ⚠ Optional | Motor RPM |  |
| Actual RPM | ✖ Required | Actual RPM |  |
| Design Impeller Diam | ⚠ Optional | Design Impeller Diam. |  |
| Actual Impeller Diam | ✖ Required | Actual Impeller Diam. |  |
| Final DP | ✖ Required | Final Pressure Hi |  |
| Final SP | ✖ Required | Final Pressure Lo |  |
| Serial | ✖ Required | Serial |  |
| Motor Make | ✖ Required | Motor Make |  |
| Frame | ✖ Required | Motor Frame |  |
| HP | ✖ Required | Motor HP |  |
| Rated Volts | ✖ Required | Motor Rated Volts |  |
| Phase | ✖ Required | Motor Phase |  |
| Hertz | ✖ Required | Motor Hertz |  |
| FL Amps | ✖ Required | Motor F.L. Amps |  |
| Service Factor | ✖ Required | Motor Service Factor |  |
| Actual Volts | ✖ Required | Motor Volts T1-T2 / Motor Volts T2-T3 / Motor Volts T1-T3 |  |
| Actual Amps | ✖ Required | Motor Amps T1 / Motor Amps T2 / Motor Amps T3 |  |
| Valve Shut DP | ✖ Required | Valve Shut Hi |  |
| Valve Shut SP | ✖ Required | Valve Shut Lo |  |
| Valve Shut Diff. | ✖ Required | Valve Shut Diff. |  |
| Valve Open DP | ✖ Required | Valve Open Hi |  |
| Valve Open SP | ✖ Required | Valve Open Lo |  |
| Valve Open Diff. | ✖ Required | Valve Open Diff. |  |
| Valve Open GPM | ✖ Required | Valve Open GPM |  |
| Valve Setting % | ⚠ Optional | Ind. Valve Setting |  |
| Nom. Eff. | ✖ Required | Nominal Efficiency |  |
| Power Factor | ✖ Required | Power Factor |  |
| VFD Setting | ⚠ Optional | VFD Setting |  |
| System DP Setpoint | ⚠ Optional | System DP Setpoint |  |
| Valve Open Amps | ✖ Required | T1/T2/T3 |  |
| Final Flow % | ⚠ Optional | Final Flow % |  |

## Chillers

Export sheet: **Chiller Test**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| MFG | ✖ Required | Manufacturer |  |
| Model | ✖ Required | Model Number |  |
| Serial | ✖ Required | Serial Number |  |
| Capacity (Tons) | ⚠ Optional | Tons |  |
| Rated Capacity | ⚠ Optional | MBH |  |
| Evaperator Design EWT | ⚠ Optional | Evap Dsgn Ent H2O Temp |  |
| Evaperator Actual EWT | ✖ Required | Evap Act Ent H2O Temp |  |
| Evaperator Design LWT | ⚠ Optional | Evap Dsgn Lvg H2O Temp |  |
| Evaperator Actual LWT | ✖ Required | Evap Act Lvg H2O Temp |  |
| Evaperator Flow Design | ⚠ Optional | Evap Flow Design |  |
| Evaperator Flow Actual | ✖ Required | Evap Flow Actual |  |
| Evaperator Design DP | ⚠ Optional | Evap DP Design |  |
| Evaperator Actual DP | ✖ Required | Evap DP Actual |  |
| Condenser Design EWT | ⚠ Optional | Cond Dsgn Ent H2O Temp |  |
| Condenser Actual EWT | ✖ Required | Cond Act Ent H2O Temp |  |
| Condenser Design LWT | ⚠ Optional | Cond Dsgn Lvg H2O Temp |  |
| Condenser Actual LWT | ✖ Required | Cond Act Lvg H2O Temp |  |
| Condenser Flow Design | ⚠ Optional | Cond Flow Design |  |
| Condenser Flow Actual | ✖ Required | Cond Flow Actual |  |
| Condenser Design DP | ⚠ Optional | Cond DP Design |  |
| Condenser Actual DP | ✖ Required | Cond DP Actual |  |
| Entering Evaperator PSI | ✖ Required | Evap. Pressure Hi |  |
| Leaving Evaperator PSI | ✖ Required | Evap. Pressure Lo |  |
| Entering Condenser PSI | ✖ Required | Cond. Pressure Hi |  |
| Leaving Condenser PSI | ✖ Required | Cond. Pressure Lo |  |
| Condenser Valve Setting | ⚠ Optional | Cond. Valve % |  |
| Evaperator Valve Setting | ⚠ Optional | Evap. Valve % |  |
| Design Condenser Delta T | ⚠ Optional | Cond. Delta T Dsgn |  |
| Actual Condenser Delta T | ✖ Required | Cond. Delta T Act |  |
| Design Evaperator Delta T | ⚠ Optional | Evap. Delta T Dsgn |  |
| Actual Evaperator Delta T | ✖ Required | Evap. Delta T Act |  |
| Design Evaperator Min PD | ⚠ Optional | Des. Press. Drop Min. Evap. Flow |  |
| Design Evaperator Min GPM | ⚠ Optional | Des. Min. Evap. Flow Rate |  |
| Actual Evaperator Min PD | ⚠ Optional | Act Press. Drop. Min. Evap. Flow |  |
| Actual Evaperator Min GPM | ⚠ Optional | Act. Min. Evap. Flow Rate |  |
| System Setpoint DP | ⚠ Optional | System Diff. Press. (D.P.) Setpoint |  |
| Evaperator Flow % | ⚠ Optional | Evap. Flow % |  |
| Condenser Flow % | ⚠ Optional | Cond. Flow % |  |

## Cooling Towers

Export sheet: **Cooling Tower *(sheet name not yet confirmed)***

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| MFG | ✖ Required | *(matched automatically)* |  |
| Model | ✖ Required | *(matched automatically)* |  |
| Serial | ✖ Required | *(matched automatically)* |  |
| Capacity (Tons) | ⚠ Optional | *(matched automatically)* |  |
| EAT Dry Bulb | ✖ Required | *(matched automatically)* |  |
| EAT Wet Bulb | ✖ Required | *(matched automatically)* |  |
| LAT Dry Bulb | ✖ Required | *(matched automatically)* |  |
| LAT Wet Bulb | ✖ Required | *(matched automatically)* |  |
| Design GPM | ⚠ Optional | *(matched automatically)* |  |
| Actual GPM | ✖ Required | *(matched automatically)* |  |
| Design D.P. | ⚠ Optional | *(matched automatically)* |  |
| Actual D.P. | ✖ Required | *(matched automatically)* |  |
| Design EWT | ⚠ Optional | *(matched automatically)* |  |
| Actual EWT | ✖ Required | *(matched automatically)* |  |
| Design LWT | ⚠ Optional | *(matched automatically)* |  |
| Actual LWT | ✖ Required | *(matched automatically)* |  |
| Bypass Valve Temp Setpoint | ⚠ Optional | *(matched automatically)* |  |
| Design Ambient WB | ⚠ Optional | *(matched automatically)* |  |
| Motor Make | ✖ Required | *(matched automatically)* |  |
| Motor Frame | ✖ Required | *(matched automatically)* |  |
| Motor HP | ✖ Required | *(matched automatically)* |  |
| Motor RPM | ✖ Required | *(matched automatically)* |  |
| Motor Rated Volts | ✖ Required | *(matched automatically)* |  |
| Motor Phase | ✖ Required | *(matched automatically)* |  |
| Motor Hertz | ✖ Required | *(matched automatically)* |  |
| Motor F.L. Amps | ✖ Required | *(matched automatically)* |  |
| Motor Service Factor | ✖ Required | *(matched automatically)* |  |
| Nominal Efficiency | ✖ Required | *(matched automatically)* |  |
| No. of Belts | ✖ Required | *(matched automatically)* |  |
| VFD Setting Hertz | ⚠ Optional | *(matched automatically)* |  |
| Balance Valve Setting | ⚠ Optional | *(matched automatically)* |  |
| Power Factor | ✖ Required | *(matched automatically)* |  |
| Actual Volts T1 | ✖ Required | *(matched automatically)* |  |
| Actual Amps T1 | ✖ Required | *(matched automatically)* |  |
| VFD Display Amps | ⚠ Optional | *(matched automatically)* |  |

## Boilers

Export sheet: **Boiler *(sheet name not yet confirmed)***

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| MFG | ✖ Required | *(matched automatically)* |  |
| Model | ✖ Required | *(matched automatically)* |  |
| Serial | ✖ Required | *(matched automatically)* |  |
| BTU Input | ⚠ Optional | *(matched automatically)* |  |
| BTU Output | ⚠ Optional | *(matched automatically)* |  |
| Fuel Type | ⚠ Optional | *(matched automatically)* |  |
| Design GPM | ⚠ Optional | *(matched automatically)* |  |
| Actual GPM | ✖ Required | *(matched automatically)* |  |
| Design DP | ⚠ Optional | *(matched automatically)* |  |
| Actual DP | ✖ Required | *(matched automatically)* |  |
| Design EWT | ⚠ Optional | *(matched automatically)* |  |
| Design LWT | ⚠ Optional | *(matched automatically)* |  |
| Actual EWT | ✖ Required | *(matched automatically)* |  |
| Actual LWT | ✖ Required | *(matched automatically)* |  |

## ACH / Pressurization

Export sheet: **ACH - Pressurization *(sheet name not yet confirmed)***

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Room | ✖ Required | *(matched automatically)* |  |
| Area Type | ✖ Required | *(matched automatically)* |  |
| Room Size | ✖ Required | *(matched automatically)* |  |
| Area Status | ✖ Required | *(matched automatically)* |  |
| Min Req ACH | ✖ Required | *(matched automatically)* |  |
| Req Pressure | ✖ Required | *(matched automatically)* |  |
| Actual D.P. | ✖ Required | *(matched automatically)* |  |
| Room Monitor Pressure | ⚠ Optional | *(matched automatically)* |  |
| Design Supply Airflow | ⚠ Optional | *(matched automatically)* |  |
| Actual Supply Airflow | ✖ Required | *(matched automatically)* |  |
| Design Exh/Ret Airflow | ⚠ Optional | *(matched automatically)* |  |
| Actual Exh/Ret Airflow | ✖ Required | *(matched automatically)* |  |
| S.P. to Clean | ⚠ Optional | *(matched automatically)* |  |
| S.P. to Corridor | ⚠ Optional | *(matched automatically)* |  |
| Design D.P. | ⚠ Optional | *(matched automatically)* |  |
| Min Required Airflow | ⚠ Optional | *(matched automatically)* |  |
| S.P. to Ante | ⚠ Optional | *(matched automatically)* |  |
| Space Temp. BAS | ⚠ Optional | *(matched automatically)* |  |
| Space Temp. Actual | ⚠ Optional | *(matched automatically)* |  |
| Space Hum. BAS | ⚠ Optional | *(matched automatically)* |  |
| Space Hum. Actual | ⚠ Optional | *(matched automatically)* |  |
| Door Sweep (Y/N) | ⚠ Optional | *(matched automatically)* |  |
| Des. Airflow Diff. | ⚠ Optional | *(matched automatically)* |  |
| Act. Airflow Diff. | ✖ Required | *(matched automatically)* |  |

## Fans (sub-item)

Export sheet: **Air Apparatus Fan**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Design Total Static Pressure | ⚠ Optional | Design T.S.P. |  |
| Actual Total Static Pressure | ✖ Required | Actual T.S.P. |  |
| Design RPM | ⚠ Optional | Design RPM |  |
| Actual RPM | ✖ Required | Actual RPM |  |
| VFD Setting | ⚠ Optional | VFD Setting |  |
| Motor MFG | ✖ Required | Motor MFG |  |
| Hertz | ✖ Required | Motor Hertz |  |
| Design Motor Amps | ✖ Required | Motor FL Amps |  |
| Service Factor | ✖ Required | Motor Service Factor |  |
| Motor RPM | ✖ Required | Motor RPM |  |
| Motor Sheave MFG | ✖ Required | Motor Sheave MFG |  |
| Design Volts | ✖ Required | Motor Rated Volts |  |
| Motor Eff | ✖ Required | Nominal Efficiency |  |
| Motor Phase | ✖ Required | Motor Phase |  |
| Power Factor | ✖ Required | Motor Power Factor |  |
| Motor Sheave Model | ✖ Required | Motor Sheave Model | Drive Type = Belt Drive |
| Motor Sheave Dia | ✖ Required | Motor Sheave Diam. | Drive Type = Belt Drive |
| Motor Sheave Bore | ✖ Required | Motor Sheave Bore | Drive Type = Belt Drive |
| Fan Sheave MFG | ✖ Required | Fan Sheave MFG | Drive Type = Belt Drive |
| Fan Sheave Model | ✖ Required | Fan Sheave Model | Drive Type = Belt Drive |
| Fan Sheave Dia | ✖ Required | Fan Sheave Diam. | Drive Type = Belt Drive |
| Fan Sheave Bore | ✖ Required | Fan Sheave Bore | Drive Type = Belt Drive |
| # of Belts | ✖ Required | Number of Belts | Drive Type = Belt Drive |
| Belt Size | ✖ Required | Belt Size | Drive Type = Belt Drive |
| Centerline Distance | ✖ Required | Sheave Center Line | Drive Type = Belt Drive |
| Actual Volts | ✖ Required | Motor Volts T1-T2 / Motor Volts T2-T3 / Motor Volts T1-T3 |  |
| Actual Amps | ✖ Required | Motor Amps T1 / Motor Amps T2 / Motor Amps T3 |  |
| HP | ✖ Required | Horsepower |  |
| Fan Array | ⚠ Optional | Fan Array |  |
| Frame | ✖ Required | Frame |  |
| Drive Type | ✖ Required | Drive Type |  |

## CHW Coils (sub-item)

Export sheet: **Air Apparatus Coil**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| GPM Design | ⚠ Optional | Water Flow Design |  |
| Water Flow Actual | ✖ Required | Water Flow Actual |  |
| % Final GPM | ⚠ Optional | % Final Diff. |  |
| Press Drop Design | ⚠ Optional | Press. Drop Design |  |
| Press Drop Actual | ✖ Required | Press. Drop Actual |  |
| Ent Water Temp Design | ⚠ Optional | Ent. Water Temp Design |  |
| Ent Water Temp Actual | ✖ Required | Ent. Water Temp Actual |  |
| Leav Water Temp Design | ⚠ Optional | Leav. Water Temp Design |  |
| Leav Water Temp Actual | ✖ Required | Leav. Water Temp Actual |  |
| Water Delta T Design | ⚠ Optional | Water Delta T Design |  |
| Water Delta T Actual | ✖ Required | Water Delta T Actual |  |
| Ent Air DB Temp Design | ⚠ Optional | Ent. Air DB Temp Design |  |
| Ent Air DB Temp Actual | ✖ Required | Ent. Air DB Temp Actual |  |
| Ent Air WB Temp Design | ⚠ Optional | Ent. Air WB Temp Design |  |
| Ent Air WB Temp Actual | ✖ Required | Ent. Air WB Temp Actual |  |
| Leav Air DB Temp Design | ⚠ Optional | Leav. Air DB Temp Design |  |
| Leav Air DB Temp Actual | ✖ Required | Leav. Air DB Temp Actual |  |
| Leav Air WB Temp Design | ⚠ Optional | Leav. Air WB Temp Design |  |
| Leav Air WB Temp Actual | ✖ Required | Leav. Air WB Temp Actual |  |
| Air Temp Delta T Design | ⚠ Optional | Air Temp Delta T Design |  |
| Air Temp Delta T Actual | ✖ Required | Air Temp Delta T Actual |  |
| Coil Inlet PSI Actual | ✖ Required | Coil Inlet PSI Actual |  |
| Coil Outlet PSI Actual | ✖ Required | Coil Outlet PSI Actual |  |
| Air Velocity Design | ⚠ Optional | Air Velocity Design |  |
| Air Velocity Actual | ✖ Required | Air Velocity Actual |  |
| Coil APD Design | ⚠ Optional | Design Coil APD |  |
| Design Capacity MBH | ⚠ Optional | Design Coil Capacity |  |
| Coil APD Actual | ✖ Required | Actual Coil APD |  |
| Face Area Sq.Ft. | ⚠ Optional | Airside Face Area |  |
| Rows | ⚠ Optional | # Rows |  |
| Fins Per Inch | ⚠ Optional | Fins Per Inch |  |
| Coil Type | ✖ Required | Coil Type |  |

## HW Coils (sub-item)

Export sheet: **Air Apparatus Heat Coil *(sheet name not yet confirmed)***

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| GPM Design | ⚠ Optional | *(matched automatically)* |  |
| Water Flow Actual | ✖ Required | *(matched automatically)* |  |
| % Final GPM | ✖ Required | *(matched automatically)* |  |
| Press Drop Design | ⚠ Optional | *(matched automatically)* |  |
| Press Drop Actual | ✖ Required | *(matched automatically)* |  |
| Ent Water Temp Design | ⚠ Optional | *(matched automatically)* |  |
| Ent Water Temp Actual | ✖ Required | *(matched automatically)* |  |
| Leav Water Temp Design | ⚠ Optional | *(matched automatically)* |  |
| Leav Water Temp Actual | ✖ Required | *(matched automatically)* |  |
| Water Delta T Design | ⚠ Optional | *(matched automatically)* |  |
| Water Delta T Actual | ✖ Required | *(matched automatically)* |  |
| Ent Air DB Temp Design | ⚠ Optional | *(matched automatically)* |  |
| Ent Air DB Temp Actual | ✖ Required | *(matched automatically)* |  |
| Leav Air DB Temp Design | ⚠ Optional | *(matched automatically)* |  |
| Leav Air DB Temp Actual | ✖ Required | *(matched automatically)* |  |
| Air Temp Delta T Design | ⚠ Optional | *(matched automatically)* |  |
| Air Temp Delta T Actual | ✖ Required | *(matched automatically)* |  |
| Face Area Sq.Ft. | ⚠ Optional | *(matched automatically)* |  |
| Rows | ⚠ Optional | *(matched automatically)* |  |
| Fins Per Inch | ⚠ Optional | *(matched automatically)* |  |
| Design Capacity MBH | ⚠ Optional | *(matched automatically)* |  |
| Air Velocity Design | ⚠ Optional | *(matched automatically)* |  |
| Air Velocity Actual | ⚠ Optional | *(matched automatically)* |  |
| Coil Inlet PSI Actual | ✖ Required | *(matched automatically)* |  |
| Coil Outlet PSI Actual | ✖ Required | *(matched automatically)* |  |
| Coil APD Design | ⚠ Optional | *(matched automatically)* |  |
| Coil APD Actual | ⚠ Optional | *(matched automatically)* |  |
| Design Airflow | ⚠ Optional | *(matched automatically)* |  |
| Design Airflow | ✖ Required | *(matched automatically)* |  |
| Coil Type | ✖ Required | *(matched automatically)* |  |

## DX Coils (sub-item)

Export sheet: **DX Coil -**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Ent Air DB Temp Design | ⚠ Optional | Ent. Air DB Temp Design |  |
| Ent Air DB Temp Actual | ✖ Required | Ent. Air DB Temp Actual |  |
| Ent Air WB Temp Design | ⚠ Optional | Ent. Air WB Temp Design |  |
| Ent Air WB Temp Actual | ✖ Required | Ent. Air WB Temp Actual |  |
| Leav Air DB Temp Design | ⚠ Optional | Leav. Air DB Temp Design |  |
| Leav Air DB Temp Actual | ✖ Required | Leav. Air DB Temp Actual |  |
| Leav Air WB Temp Design | ⚠ Optional | Leav. Air WB Temp Design |  |
| Leav Air WB Temp Actual | ✖ Required | Leav. Air WB Temp Actual |  |
| Air Temp Delta T Design | ⚠ Optional | Air Temp Delta T Design |  |
| Air Temp Delta T Actual | ✖ Required | Air Temp Delta T Actual |  |
| Face Area Sq.Ft. | ⚠ Optional | Airside Face Area |  |
| Rows | ⚠ Optional | # Rows |  |
| Fins Per Inch | ⚠ Optional | Fins Per Inch |  |
| Design Capacity MBH | ⚠ Optional | Design Coil Capacity |  |
| Air Velocity Design | ⚠ Optional | Air Velocity Design |  |
| Air Velocity Actual | ✖ Required | Air Velocity Actual |  |
| Coil APD Design | ⚠ Optional | Design Coil APD |  |
| Coil APD Actual | ✖ Required | Actual Coil APD |  |
| Airflow Design | ⚠ Optional | Airflow Design |  |
| Airflow Actual | ✖ Required | Airflow Actual |  |

## Electric Heat (sub-item)

Export sheet: **Electric Coil -**

| Field | Status | Export column(s) | Only when |
| --- | --- | --- | --- |
| Design EAT | ⚠ Optional | EAT Design |  |
| Actual EAT | ✖ Required | EAT Actual |  |
| Design LAT | ⚠ Optional | LAT Design |  |
| Actual LAT | ✖ Required | LAT Actual |  |
| Design Delta T | ⚠ Optional | Air Temp Design Delta T |  |
| Actual Delta T | ✖ Required | Air Temp Delta T |  |
| EDH Rated KW | ⚠ Optional | EDH Rated KW |  |
| EDH Actual KW | ✖ Required | EDH Actual KW |  |
| KW % Final | ⚠ Optional | KW% Final |  |
| EDH Stages | ⚠ Optional | EDH Stages |  |
| Phase | ⚠ Optional | Phase |  |
| Design Volts | ⚠ Optional | EDH Design Volts |  |
| Actual Volts | ✖ Required | EDH Act. Volts 1 / EDH Act. Volts 2 / EDH Act. Volts 3 |  |
| Design Amps | ⚠ Optional | EDH Design Amps |  |
| Actual Amps | ✖ Required | EDH Act. Amps 1 / EDH Act. Amps 3 / EDH Act. Amps 2 |  |
| Design Airflow | ⚠ Optional | Airflow Design |  |
| Actual Airflow | ✖ Required | Airflow Actual |  |
