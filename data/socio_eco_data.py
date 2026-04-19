from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
SOCIO_DIR = BASE_DIR / "socio_eco"

IMD_FILE = SOCIO_DIR / "ID 2019 for London(LSOA).csv"
LSOA11_MSOA11_FILE = SOCIO_DIR / "LSOA11_MSOA11.csv"
MSOA11_MSOA21_FILE = (
    SOCIO_DIR
    / "MSOA_(2011)_to_MSOA_(2021)_to_Local_Authority_District_(2022)_Exact_Fit_Lookup_for_EW_(V2).csv"
)
POP_DENSITY_FILE = SOCIO_DIR / "population_density_2021.csv"
PTAL_FILE = SOCIO_DIR / "LSOA2011 AvPTAI2015.csv"

OUT_RAW = SOCIO_DIR / "msoa_socioeconomic.csv"
OUT_NORM = SOCIO_DIR / "msoa_socioeconomic_normalized.csv"
OUT_MISSING = SOCIO_DIR / "msoa_socioeconomic_missing_report.csv"


def minmax(series: pd.Series) -> pd.Series:
    value_range = series.max(skipna=True) - series.min(skipna=True)
    if pd.isna(value_range) or value_range == 0:
        return pd.Series(0, index=series.index)
    return (series - series.min(skipna=True)) / value_range


def build_socioeconomic_data() -> None:
    imd = pd.read_csv(IMD_FILE)
    lsoa11_msoa11 = pd.read_csv(LSOA11_MSOA11_FILE)
    msoa11_msoa21 = pd.read_csv(MSOA11_MSOA21_FILE)
    pop = pd.read_csv(POP_DENSITY_FILE)
    ptal = pd.read_csv(PTAL_FILE)

    imd = imd[
        ["LSOA code (2011)", "Index of Multiple Deprivation (IMD) Score"]
    ].rename(
        columns={
            "LSOA code (2011)": "lsoa11",
            "Index of Multiple Deprivation (IMD) Score": "imd",
        }
    )

    lsoa11_msoa11 = lsoa11_msoa11[["LSOA11CD", "MSOA11CD"]].rename(
        columns={"LSOA11CD": "lsoa11", "MSOA11CD": "msoa"}
    ).drop_duplicates()

    pop = pop[["Middle layer Super Output Areas Code", "Observation"]].rename(
        columns={
            "Middle layer Super Output Areas Code": "msoa21",
            "Observation": "density",
        }
    )

    ptal = ptal[["LSOA2011", "AvPTAI2015"]].rename(
        columns={
            "LSOA2011": "lsoa11",
            "AvPTAI2015": "ptal",
        }
    )

    imd_lookup = imd.merge(lsoa11_msoa11, on="lsoa11", how="left")
    print("Missing MSOA after IMD lookup:", imd_lookup["msoa"].isna().sum())

    msoa_imd = (
        imd_lookup.groupby("msoa", dropna=False)["imd"]
        .mean()
        .reset_index()
        .dropna(subset=["msoa"])
    )

    ptal_lookup = ptal.merge(lsoa11_msoa11, on="lsoa11", how="left")
    print("Missing MSOA after PTAL lookup:", ptal_lookup["msoa"].isna().sum())

    msoa_ptal = (
        ptal_lookup.groupby("msoa", dropna=False)["ptal"]
        .mean()
        .reset_index()
        .dropna(subset=["msoa"])
    )

    # Prefer direct code matches where 2011 and 2021 MSOA codes are unchanged.
    direct_density = pop.rename(columns={"msoa21": "msoa", "density": "density_direct"})

    # Fill changed/split MSOA11 codes via the official exact-fit MSOA11 -> MSOA21 lookup.
    bridge_density = (
        msoa11_msoa21[["MSOA11CD", "MSOA21CD"]]
        .rename(columns={"MSOA11CD": "msoa", "MSOA21CD": "msoa21"})
        .drop_duplicates()
        .merge(pop, on="msoa21", how="left")
    )

    # The exact-fit lookup can map one 2011 MSOA to multiple 2021 MSOAs. The source
    # density file has no overlap/population weights, so this is an approximate mean
    # used only to backfill records that direct matching cannot cover.
    bridge_density = (
        bridge_density.groupby("msoa", dropna=False)["density"]
        .mean()
        .reset_index()
        .rename(columns={"density": "density_bridge"})
    )

    msoa_final = (
        msoa_imd.merge(direct_density, on="msoa", how="left")
        .merge(bridge_density, on="msoa", how="left")
        .merge(msoa_ptal, on="msoa", how="left")
    )
    msoa_final["density"] = msoa_final["density_direct"].combine_first(
        msoa_final["density_bridge"]
    )
    msoa_final["density_source"] = "direct"
    msoa_final.loc[
        msoa_final["density_direct"].isna() & msoa_final["density_bridge"].notna(),
        "density_source",
    ] = "msoa11_msoa21_bridge"
    msoa_final.loc[msoa_final["density"].isna(), "density_source"] = "missing"
    msoa_final = msoa_final.drop(columns=["density_direct", "density_bridge"])

    missing = msoa_final[msoa_final[["imd", "density", "ptal"]].isna().any(axis=1)]
    missing.to_csv(OUT_MISSING, index=False)

    print("Missing density after direct + bridge:", msoa_final["density"].isna().sum())
    print("Missing PTAL after LSOA aggregation:", msoa_final["ptal"].isna().sum())
    print("Bridge-filled density rows:", (msoa_final["density_source"] == "msoa11_msoa21_bridge").sum())

    msoa_final.to_csv(OUT_RAW, index=False)

    msoa_final["imd_norm"] = minmax(msoa_final["imd"])
    msoa_final["density_norm"] = minmax(msoa_final["density"])
    msoa_final["ptal_norm"] = minmax(msoa_final["ptal"])
    msoa_final.to_csv(OUT_NORM, index=False)

    print(f"Saved: {OUT_RAW}")
    print(f"Saved: {OUT_NORM}")
    print(f"Saved: {OUT_MISSING}")


if __name__ == "__main__":
    build_socioeconomic_data()
