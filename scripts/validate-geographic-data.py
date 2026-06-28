#!/usr/bin/env python3
"""
===========================================================
VALIDACIÓN Y CORRECCIÓN DE DATOS GEOGRÁFICOS
Ontario & Quebec - CanTrack CRM
===========================================================

Lee los archivos CSV exportados de ontario_companies y quebec_companies,
valida los campos geográficos (PROVINCIA, REGIÓN, CIUDAD, PUEBLO)
contra la DIRECCION usando referencias oficiales canadienses.

Modos de operación:
  python validate-geographic-data.py              → diagnóstico (solo reporte)
  python validate-geographic-data.py --fix        → aplicar correcciones en DB
  python validate-geographic-data.py --csv-fix    → generar CSVs corregidos

Requisitos: pip install psycopg2-binary
"""

import csv
import os
import sys
import re
import json
from datetime import datetime
from collections import defaultdict

# =========================================================================
# 1. REFERENCIA GEOGRÁFICA OFICIAL DE CANADÁ
# =========================================================================

# Provincias y sus abreviaturas
PROVINCE_MAP = {
    'ON': 'Ontario', 'ONTARIO': 'Ontario', 'ONT': 'Ontario',
    'QC': 'Quebec', 'QUEBEC': 'Quebec', 'QUÉBEC': 'Quebec', 'QUE': 'Quebec',
}

# Postal code FSA -> Provincia
# Primer letra del código postal canadiense determina provincia/región
POSTAL_PROVINCE = {
    'K': 'Ontario',  # Eastern Ontario
    'L': 'Ontario',  # Central Ontario
    'M': 'Ontario',  # Toronto
    'N': 'Ontario',  # Southwestern Ontario
    'P': 'Ontario',  # Northern Ontario
    'G': 'Quebec',   # Quebec City area
    'H': 'Quebec',   # Montreal area
    'J': 'Quebec',   # Western Quebec
}

# =========================================================================
# 1a. REFERENCIA DE CIUDADES - ONTARIO
# =========================================================================

ONTARIO_CITIES = {
    # --- GTA / Toronto ---
    'Toronto': {'region': 'Greater Toronto Area', 'province': 'Ontario'},
    'North York': {'region': 'Greater Toronto Area', 'province': 'Ontario'},
    'Scarborough': {'region': 'Greater Toronto Area', 'province': 'Ontario'},
    'Etobicoke': {'region': 'Greater Toronto Area', 'province': 'Ontario'},
    'East York': {'region': 'Greater Toronto Area', 'province': 'Ontario'},
    'York': {'region': 'Greater Toronto Area', 'province': 'Ontario'},
    'Old Toronto': {'region': 'Greater Toronto Area', 'province': 'Ontario'},
    'Downtown Toronto': {'region': 'Greater Toronto Area', 'province': 'Ontario'},

    # --- Peel Region ---
    'Mississauga': {'region': 'Peel Region', 'province': 'Ontario'},
    'Brampton': {'region': 'Peel Region', 'province': 'Ontario'},
    'Caledon': {'region': 'Peel Region', 'province': 'Ontario'},
    'Bolton': {'region': 'Peel Region', 'province': 'Ontario'},
    'Malton': {'region': 'Peel Region', 'province': 'Ontario'},

    # --- York Region ---
    'Markham': {'region': 'York Region', 'province': 'Ontario'},
    'Unionville': {'region': 'York Region', 'province': 'Ontario'},
    'Vaughan': {'region': 'York Region', 'province': 'Ontario'},
    'Woodbridge': {'region': 'York Region', 'province': 'Ontario'},
    'Richmond Hill': {'region': 'York Region', 'province': 'Ontario'},
    'Aurora': {'region': 'York Region', 'province': 'Ontario'},
    'Newmarket': {'region': 'York Region', 'province': 'Ontario'},
    'King City': {'region': 'York Region', 'province': 'Ontario'},
    'King': {'region': 'York Region', 'province': 'Ontario'},
    'Whitchurch-Stouffville': {'region': 'York Region', 'province': 'Ontario'},
    'Stouffville': {'region': 'York Region', 'province': 'Ontario'},
    'East Gwillimbury': {'region': 'York Region', 'province': 'Ontario'},
    'Georgina': {'region': 'York Region', 'province': 'Ontario'},
    'Keswick': {'region': 'York Region', 'province': 'Ontario'},
    'Thornhill': {'region': 'York Region', 'province': 'Ontario'},
    'Maple': {'region': 'York Region', 'province': 'Ontario'},
    'Kleinburg': {'region': 'York Region', 'province': 'Ontario'},

    # --- Durham Region ---
    'Ajax': {'region': 'Durham Region', 'province': 'Ontario'},
    'Pickering': {'region': 'Durham Region', 'province': 'Ontario'},
    'Whitby': {'region': 'Durham Region', 'province': 'Ontario'},
    'Oshawa': {'region': 'Durham Region', 'province': 'Ontario'},
    'Bowmanville': {'region': 'Durham Region', 'province': 'Ontario'},
    'Clarington': {'region': 'Durham Region', 'province': 'Ontario'},
    'Courtice': {'region': 'Durham Region', 'province': 'Ontario'},
    'Newcastle': {'region': 'Durham Region', 'province': 'Ontario'},
    'Port Perry': {'region': 'Durham Region', 'province': 'Ontario'},
    'Uxbridge': {'region': 'Durham Region', 'province': 'Ontario'},
    'Beaverton': {'region': 'Durham Region', 'province': 'Ontario'},

    # --- Halton Region ---
    'Burlington': {'region': 'Halton Region', 'province': 'Ontario'},
    'Oakville': {'region': 'Halton Region', 'province': 'Ontario'},
    'Milton': {'region': 'Halton Region', 'province': 'Ontario'},
    'Halton Hills': {'region': 'Halton Region', 'province': 'Ontario'},
    'Georgetown': {'region': 'Halton Region', 'province': 'Ontario'},
    'Acton': {'region': 'Halton Region', 'province': 'Ontario'},

    # --- Hamilton ---
    'Hamilton': {'region': 'Hamilton', 'province': 'Ontario'},
    'Stoney Creek': {'region': 'Hamilton', 'province': 'Ontario'},
    'Ancaster': {'region': 'Hamilton', 'province': 'Ontario'},
    'Dundas': {'region': 'Hamilton', 'province': 'Ontario'},
    'Waterdown': {'region': 'Hamilton', 'province': 'Ontario'},
    'Mount Hope': {'region': 'Hamilton', 'province': 'Ontario'},
    'Glanbrook': {'region': 'Hamilton', 'province': 'Ontario'},
    'Flamborough': {'region': 'Hamilton', 'province': 'Ontario'},

    # --- Niagara Region ---
    'St. Catharines': {'region': 'Niagara Region', 'province': 'Ontario'},
    'St Catharines': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Niagara Falls': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Welland': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Thorold': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Port Colborne': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Fort Erie': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Grimsby': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Lincoln': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Niagara-on-the-Lake': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Beamsville': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Pelham': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Ridgeway': {'region': 'Niagara Region', 'province': 'Ontario'},
    'Virgil': {'region': 'Niagara Region', 'province': 'Ontario'},

    # --- Waterloo Region ---
    'Kitchener': {'region': 'Waterloo Region', 'province': 'Ontario'},
    'Waterloo': {'region': 'Waterloo Region', 'province': 'Ontario'},
    'Cambridge': {'region': 'Waterloo Region', 'province': 'Ontario'},

    # --- Ottawa ---
    'Ottawa': {'region': 'Ottawa', 'province': 'Ontario'},
    'Kanata': {'region': 'Ottawa', 'province': 'Ontario'},
    'Nepean': {'region': 'Ottawa', 'province': 'Ontario'},
    'Orleans': {'region': 'Ottawa', 'province': 'Ontario'},
    'Gloucester': {'region': 'Ottawa', 'province': 'Ontario'},
    'Vanier': {'region': 'Ottawa', 'province': 'Ontario'},
    'Manotick': {'region': 'Ottawa', 'province': 'Ontario'},
    'Ashton': {'region': 'Ottawa', 'province': 'Ontario'},
    'Carp': {'region': 'Ottawa', 'province': 'Ontario'},
    'Richmond': {'region': 'Ottawa', 'province': 'Ontario'},
    'Stittsville': {'region': 'Ottawa', 'province': 'Ontario'},

    # --- Simcoe County ---
    'Barrie': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Orillia': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Midland': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Collingwood': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Wasaga Beach': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Innisfil': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Bradford': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Bradford West Gwillimbury': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Alliston': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Angus': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Elmvale': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Penetanguishene': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Stayner': {'region': 'Simcoe County', 'province': 'Ontario'},
    'Tottenham': {'region': 'Simcoe County', 'province': 'Ontario'},

    # --- Middlesex County / London ---
    'London': {'region': 'Middlesex County', 'province': 'Ontario'},
    'Strathroy': {'region': 'Middlesex County', 'province': 'Ontario'},
    'St. Thomas': {'region': 'Elgin County', 'province': 'Ontario'},
    'St Thomas': {'region': 'Elgin County', 'province': 'Ontario'},

    # --- Essex County / Windsor ---
    'Windsor': {'region': 'Essex County', 'province': 'Ontario'},
    'Tecumseh': {'region': 'Essex County', 'province': 'Ontario'},
    'Kingsville': {'region': 'Essex County', 'province': 'Ontario'},
    'Essex': {'region': 'Essex County', 'province': 'Ontario'},
    'LaSalle': {'region': 'Essex County', 'province': 'Ontario'},
    'Amherstburg': {'region': 'Essex County', 'province': 'Ontario'},
    'Leamington': {'region': 'Essex County', 'province': 'Ontario'},
    'Lakeshore': {'region': 'Essex County', 'province': 'Ontario'},

    # --- Lambton County ---
    'Sarnia': {'region': 'Lambton County', 'province': 'Ontario'},
    'Petrolia': {'region': 'Lambton County', 'province': 'Ontario'},
    'Point Edward': {'region': 'Lambton County', 'province': 'Ontario'},

    # --- Chatham-Kent ---
    'Chatham': {'region': 'Chatham-Kent', 'province': 'Ontario'},
    'Wallaceburg': {'region': 'Chatham-Kent', 'province': 'Ontario'},
    'Blenheim': {'region': 'Chatham-Kent', 'province': 'Ontario'},
    'Ridgetown': {'region': 'Chatham-Kent', 'province': 'Ontario'},
    'Tilbury': {'region': 'Chatham-Kent', 'province': 'Ontario'},
    'Bothwell': {'region': 'Chatham-Kent', 'province': 'Ontario'},
    'Dresden': {'region': 'Chatham-Kent', 'province': 'Ontario'},

    # --- Oxford County ---
    'Woodstock': {'region': 'Oxford County', 'province': 'Ontario'},
    'Tillsonburg': {'region': 'Oxford County', 'province': 'Ontario'},
    'Ingersoll': {'region': 'Oxford County', 'province': 'Ontario'},
    'Norwich': {'region': 'Oxford County', 'province': 'Ontario'},

    # --- Brant County ---
    'Brantford': {'region': 'Brant County', 'province': 'Ontario'},
    'Paris': {'region': 'Brant County', 'province': 'Ontario'},
    'Burford': {'region': 'Brant County', 'province': 'Ontario'},

    # --- Perth County ---
    'Stratford': {'region': 'Perth County', 'province': 'Ontario'},
    'St. Marys': {'region': 'Perth County', 'province': 'Ontario'},
    'St Marys': {'region': 'Perth County', 'province': 'Ontario'},
    'Listowel': {'region': 'Perth County', 'province': 'Ontario'},

    # --- Huron County ---
    'Goderich': {'region': 'Huron County', 'province': 'Ontario'},
    'Clinton': {'region': 'Huron County', 'province': 'Ontario'},
    'Wingham': {'region': 'Huron County', 'province': 'Ontario'},

    # --- Bruce County ---
    'Kincardine': {'region': 'Bruce County', 'province': 'Ontario'},
    'Port Elgin': {'region': 'Bruce County', 'province': 'Ontario'},
    'Saugeen Shores': {'region': 'Bruce County', 'province': 'Ontario'},
    'Walkerton': {'region': 'Bruce County', 'province': 'Ontario'},
    'Hanover': {'region': 'Bruce County', 'province': 'Ontario'},
    'Chesley': {'region': 'Bruce County', 'province': 'Ontario'},

    # --- Grey County ---
    'Owen Sound': {'region': 'Grey County', 'province': 'Ontario'},
    'Meaford': {'region': 'Grey County', 'province': 'Ontario'},
    'Thornbury': {'region': 'Grey County', 'province': 'Ontario'},
    'Markdale': {'region': 'Grey County', 'province': 'Ontario'},
    'Hanover': {'region': 'Grey County', 'province': 'Ontario'},
    'Grey Highlands': {'region': 'Grey County', 'province': 'Ontario'},

    # --- Wellington County ---
    'Guelph': {'region': 'Wellington County', 'province': 'Ontario'},
    'Erin': {'region': 'Wellington County', 'province': 'Ontario'},
    'Fergus': {'region': 'Wellington County', 'province': 'Ontario'},
    'Mount Forest': {'region': 'Wellington County', 'province': 'Ontario'},
    'Arthur': {'region': 'Wellington County', 'province': 'Ontario'},
    'Rockwood': {'region': 'Wellington County', 'province': 'Ontario'},

    # --- Haldimand-Norfolk ---
    'Simcoe': {'region': 'Norfolk County', 'province': 'Ontario'},
    'Norfolk': {'region': 'Norfolk County', 'province': 'Ontario'},
    'Dunnville': {'region': 'Haldimand County', 'province': 'Ontario'},
    'Caledonia': {'region': 'Haldimand County', 'province': 'Ontario'},
    'Haldimand': {'region': 'Haldimand County', 'province': 'Ontario'},
    'Port Dover': {'region': 'Norfolk County', 'province': 'Ontario'},
    'Delhi': {'region': 'Norfolk County', 'province': 'Ontario'},

    # --- Northumberland County ---
    'Cobourg': {'region': 'Northumberland County', 'province': 'Ontario'},
    'Port Hope': {'region': 'Northumberland County', 'province': 'Ontario'},
    'Brighton': {'region': 'Northumberland County', 'province': 'Ontario'},
    'Colborne': {'region': 'Northumberland County', 'province': 'Ontario'},
    'Campbellford': {'region': 'Northumberland County', 'province': 'Ontario'},

    # --- Peterborough County ---
    'Peterborough': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Lakefield': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Norwood': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Havelock': {'region': 'Peterborough County', 'province': 'Ontario'},

    # --- Kawartha Lakes ---
    'Lindsay': {'region': 'Kawartha Lakes', 'province': 'Ontario'},
    'Bobcaygeon': {'region': 'Kawartha Lakes', 'province': 'Ontario'},
    'Fenelon Falls': {'region': 'Kawartha Lakes', 'province': 'Ontario'},

    # --- Hastings County ---
    'Belleville': {'region': 'Hastings County', 'province': 'Ontario'},
    'Quinte West': {'region': 'Hastings County', 'province': 'Ontario'},
    'Trenton': {'region': 'Hastings County', 'province': 'Ontario'},
    'Bancroft': {'region': 'Hastings County', 'province': 'Ontario'},
    'Madoc': {'region': 'Hastings County', 'province': 'Ontario'},
    'Deseronto': {'region': 'Hastings County', 'province': 'Ontario'},

    # --- Prince Edward County ---
    'Picton': {'region': 'Prince Edward County', 'province': 'Ontario'},
    'Wellington': {'region': 'Prince Edward County', 'province': 'Ontario'},

    # --- Lennox & Addington ---
    'Napanee': {'region': 'Lennox and Addington County', 'province': 'Ontario'},

    # --- Frontenac County / Kingston ---
    'Kingston': {'region': 'Frontenac County', 'province': 'Ontario'},

    # --- Leeds & Grenville ---
    'Brockville': {'region': 'Leeds and Grenville', 'province': 'Ontario'},
    'Gananoque': {'region': 'Leeds and Grenville', 'province': 'Ontario'},
    'Prescott': {'region': 'Leeds and Grenville', 'province': 'Ontario'},
    'Kemptville': {'region': 'Leeds and Grenville', 'province': 'Ontario'},

    # --- Lanark County ---
    'Carleton Place': {'region': 'Lanark County', 'province': 'Ontario'},
    'Almonte': {'region': 'Lanark County', 'province': 'Ontario'},
    'Smiths Falls': {'region': 'Lanark County', 'province': 'Ontario'},
    'Perth': {'region': 'Lanark County', 'province': 'Ontario'},

    # --- Renfrew County ---
    'Pembroke': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Petawawa': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Renfrew': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Arnprior': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Deep River': {'region': 'Renfrew County', 'province': 'Ontario'},

    # --- Prescott-Russell ---
    'Hawkesbury': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Rockland': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Embrun': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Casselman': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Alfred': {'region': 'Prescott and Russell', 'province': 'Ontario'},

    # --- Stormont, Dundas & Glengarry ---
    'Cornwall': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Alexandria': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Morrisburg': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Winchester': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Ingleside': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},

    # --- Nipissing District ---
    'North Bay': {'region': 'Nipissing District', 'province': 'Ontario'},
    'Sturgeon Falls': {'region': 'Nipissing District', 'province': 'Ontario'},
    'Mattawa': {'region': 'Nipissing District', 'province': 'Ontario'},
    'West Nipissing': {'region': 'Nipissing District', 'province': 'Ontario'},

    # --- Parry Sound District ---
    'Parry Sound': {'region': 'Parry Sound District', 'province': 'Ontario'},
    'Huntsville': {'region': 'Muskoka District', 'province': 'Ontario'},
    'Bracebridge': {'region': 'Muskoka District', 'province': 'Ontario'},
    'Gravenhurst': {'region': 'Muskoka District', 'province': 'Ontario'},
    'Muskoka': {'region': 'Muskoka District', 'province': 'Ontario'},
    'Port Carling': {'region': 'Muskoka District', 'province': 'Ontario'},

    # --- Haliburton County ---
    'Haliburton': {'region': 'Haliburton County', 'province': 'Ontario'},
    'Minden': {'region': 'Haliburton County', 'province': 'Ontario'},

    # --- Greater Sudbury ---
    'Sudbury': {'region': 'Greater Sudbury', 'province': 'Ontario'},
    'Greater Sudbury': {'region': 'Greater Sudbury', 'province': 'Ontario'},
    'Valley East': {'region': 'Greater Sudbury', 'province': 'Ontario'},

    # --- Sudbury District ---
    'Espanola': {'region': 'Sudbury District', 'province': 'Ontario'},
    'Chapleau': {'region': 'Sudbury District', 'province': 'Ontario'},

    # --- Manitoulin District ---
    'Little Current': {'region': 'Manitoulin District', 'province': 'Ontario'},

    # --- Timiskaming District ---
    'Temiskaming Shores': {'region': 'Timiskaming District', 'province': 'Ontario'},
    'New Liskeard': {'region': 'Timiskaming District', 'province': 'Ontario'},
    'Kirkland Lake': {'region': 'Timiskaming District', 'province': 'Ontario'},
    'Haileybury': {'region': 'Timiskaming District', 'province': 'Ontario'},
    'Cobalt': {'region': 'Timiskaming District', 'province': 'Ontario'},
    'Englehart': {'region': 'Timiskaming District', 'province': 'Ontario'},

    # --- Cochrane District ---
    'Timmins': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Kapuskasing': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Moosonee': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Hearst': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Iroquois Falls': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Cochrane': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Smooth Rock Falls': {'region': 'Cochrane District', 'province': 'Ontario'},

    # --- Algoma District ---
    'Sault Ste. Marie': {'region': 'Algoma District', 'province': 'Ontario'},
    'Sault Ste Marie': {'region': 'Algoma District', 'province': 'Ontario'},
    'Elliot Lake': {'region': 'Algoma District', 'province': 'Ontario'},
    'Blind River': {'region': 'Algoma District', 'province': 'Ontario'},
    'Wawa': {'region': 'Algoma District', 'province': 'Ontario'},
    'Spanish': {'region': 'Algoma District', 'province': 'Ontario'},

    # --- Thunder Bay District ---
    'Thunder Bay': {'region': 'Thunder Bay District', 'province': 'Ontario'},

    # --- Kenora District ---
    'Kenora': {'region': 'Kenora District', 'province': 'Ontario'},
    'Dryden': {'region': 'Kenora District', 'province': 'Ontario'},
    'Red Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Sioux Lookout': {'region': 'Kenora District', 'province': 'Ontario'},

    # --- Rainy River District ---
    'Fort Frances': {'region': 'Rainy River District', 'province': 'Ontario'},
    'Rainy River': {'region': 'Rainy River District', 'province': 'Ontario'},

    # --- Otras ciudades Ontario ---
    'St. Albert': {'region': 'Eastern Ontario', 'province': 'Ontario'},
    'St Albert': {'region': 'Eastern Ontario', 'province': 'Ontario'},
    'Russell': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Navan': {'region': 'Ottawa', 'province': 'Ontario'},
    'Bourget': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'L''Orignal': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Vankleek Hill': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Sharbot Lake': {'region': 'Frontenac County', 'province': 'Ontario'},
    'Merrickville': {'region': 'Leeds and Grenville', 'province': 'Ontario'},
    'Westport': {'region': 'Leeds and Grenville', 'province': 'Ontario'},
    'Delta': {'region': 'Leeds and Grenville', 'province': 'Ontario'},
    'Lyn': {'region': 'Leeds and Grenville', 'province': 'Ontario'},
    'Mallorytown': {'region': 'Leeds and Grenville', 'province': 'Ontario'},
    'Iroquois': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Long Sault': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Williamstown': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Lancaster': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Moose Factory': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Atikokan': {'region': 'Rainy River District', 'province': 'Ontario'},
    'Ignace': {'region': 'Kenora District', 'province': 'Ontario'},
    'Vermilion Bay': {'region': 'Kenora District', 'province': 'Ontario'},
    'Ear Falls': {'region': 'Kenora District', 'province': 'Ontario'},
    'Geraldton': {'region': 'Thunder Bay District', 'province': 'Ontario'},
    'Nipigon': {'region': 'Thunder Bay District', 'province': 'Ontario'},
    'Longlac': {'region': 'Thunder Bay District', 'province': 'Ontario'},
    'Terrace Bay': {'region': 'Thunder Bay District', 'province': 'Ontario'},
    'Marathon': {'region': 'Thunder Bay District', 'province': 'Ontario'},
    'Manitouwadge': {'region': 'Thunder Bay District', 'province': 'Ontario'},
    'Greenstone': {'region': 'Thunder Bay District', 'province': 'Ontario'},
    'Hornepayne': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Foleyet': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Gogama': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Matheson': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Powassan': {'region': 'Parry Sound District', 'province': 'Ontario'},
    'South River': {'region': 'Parry Sound District', 'province': 'Ontario'},
    'Sundridge': {'region': 'Parry Sound District', 'province': 'Ontario'},
    'Burk''s Falls': {'region': 'Parry Sound District', 'province': 'Ontario'},
    'Dorset': {'region': 'Haliburton County', 'province': 'Ontario'},
    'Carnarvon': {'region': 'Haliburton County', 'province': 'Ontario'},
    'Gooderham': {'region': 'Haliburton County', 'province': 'Ontario'},
    'Wilberforce': {'region': 'Haliburton County', 'province': 'Ontario'},
    'Barry''s Bay': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Killaloe': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Eganville': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Cobden': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Westmeath': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Beachburg': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Foresters Falls': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Pikwakanagan': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Golden Lake': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Chalk River': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Point Alexander': {'region': 'Renfrew County', 'province': 'Ontario'},
    'Laurentian Hills': {'region': 'Renfrew County', 'province': 'Ontario'},
    'St. Eugene': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'St. Isidore': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Plantagenet': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Moose Creek': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Dalkeith': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Apple Hill': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'St. Andrews West': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Martintown': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Bainsville': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Glen Robertson': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Maxville': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'St. Pauls': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Aultsville': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Crysler': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Mountain': {'region': 'Stormont, Dundas and Glengarry', 'province': 'Ontario'},
    'Bourget': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Ste-Anne-de-Prescott': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Chute-a-Blondeau': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Lefaivre': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Saint-Eugene': {'region': 'Prescott and Russell', 'province': 'Ontario'},
    'Tweed': {'region': 'Hastings County', 'province': 'Ontario'},
    'Marmora': {'region': 'Hastings County', 'province': 'Ontario'},
    'Stirling': {'region': 'Hastings County', 'province': 'Ontario'},
    'Frankford': {'region': 'Hastings County', 'province': 'Ontario'},
    'Foxboro': {'region': 'Hastings County', 'province': 'Ontario'},
    'L''Amable': {'region': 'Hastings County', 'province': 'Ontario'},
    'Maynooth': {'region': 'Hastings County', 'province': 'Ontario'},
    'Bridgenorth': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Young''s Point': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Ennismore': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Douro': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Warsaw': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Keene': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Chemong': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Apsley': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Woodview': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Buckhorn': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Lakehurst': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Selwyn': {'region': 'Peterborough County', 'province': 'Ontario'},
    'Omemee': {'region': 'Kawartha Lakes', 'province': 'Ontario'},
    'Pleasant Point': {'region': 'Kawartha Lakes', 'province': 'Ontario'},
    'Woodville': {'region': 'Kawartha Lakes', 'province': 'Ontario'},
    'Oakwood': {'region': 'Kawartha Lakes', 'province': 'Ontario'},
    'Cameron': {'region': 'Kawartha Lakes', 'province': 'Ontario'},
    'Cannington': {'region': 'Durham Region', 'province': 'Ontario'},
    'Sunderland': {'region': 'Durham Region', 'province': 'Ontario'},
    'Zephyr': {'region': 'Durham Region', 'province': 'Ontario'},
    'Blackstock': {'region': 'Durham Region', 'province': 'Ontario'},
    'Nestor Falls': {'region': 'Kenora District', 'province': 'Ontario'},
    'Sandy Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Fort Albany': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Attawapiskat': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Kashechewan': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Peawanuck': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Pickle Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Mishkeegogamang': {'region': 'Kenora District', 'province': 'Ontario'},
    'Cat Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Lac Seul': {'region': 'Kenora District', 'province': 'Ontario'},
    'Deer Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Pikangikum': {'region': 'Kenora District', 'province': 'Ontario'},
    'Poplar Hill': {'region': 'Kenora District', 'province': 'Ontario'},
    'McDowell Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'North Spirit Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Wunnummin Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Kasabonika': {'region': 'Kenora District', 'province': 'Ontario'},
    'Kingfisher Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Wapekeka': {'region': 'Kenora District', 'province': 'Ontario'},
    'Sachigo Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Bearskin Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Angling Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Muskrat Dam': {'region': 'Kenora District', 'province': 'Ontario'},
    'Webequie': {'region': 'Kenora District', 'province': 'Ontario'},
    'Kitchenuhmaykoosib': {'region': 'Kenora District', 'province': 'Ontario'},
    'Big Trout Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Kasabonika Lake': {'region': 'Kenora District', 'province': 'Ontario'},
    'Fort Severn': {'region': 'Kenora District', 'province': 'Ontario'},
    'Waskaganish': {'region': 'Cochrane District', 'province': 'Ontario'},
    'Chisasibi': {'region': 'Cochrane District', 'province': 'Ontario'},
}

# =========================================================================
# 1b. REFERENCIA DE CIUDADES - QUEBEC
# =========================================================================

QUEBEC_CITIES = {
    # --- Montreal / Île de Montréal ---
    'Montreal': {'region': 'Montreal', 'province': 'Quebec'},
    'Montréal': {'region': 'Montreal', 'province': 'Quebec'},
    'Montreal-Nord': {'region': 'Montreal', 'province': 'Quebec'},
    'Montreal-Est': {'region': 'Montreal', 'province': 'Quebec'},
    'Montreal-Ouest': {'region': 'Montreal', 'province': 'Quebec'},
    'Montreal-Quest': {'region': 'Montreal', 'province': 'Quebec'},
    'Westmount': {'region': 'Montreal', 'province': 'Quebec'},
    'Mont-Royal': {'region': 'Montreal', 'province': 'Quebec'},
    'Mount Royal': {'region': 'Montreal', 'province': 'Quebec'},
    'Cote-Saint-Luc': {'region': 'Montreal', 'province': 'Quebec'},
    'Côte-Saint-Luc': {'region': 'Montreal', 'province': 'Quebec'},
    'Hampstead': {'region': 'Montreal', 'province': 'Quebec'},
    'Montreal-Ouest': {'region': 'Montreal', 'province': 'Quebec'},
    'Pointe-Claire': {'region': 'Montreal', 'province': 'Quebec'},
    'Dorval': {'region': 'Montreal', 'province': 'Quebec'},
    'Kirkland': {'region': 'Montreal', 'province': 'Quebec'},
    'Beaconsfield': {'region': 'Montreal', 'province': 'Quebec'},
    'Baie-D-Urfe': {'region': 'Montreal', 'province': 'Quebec'},
    'Baie-d''Urfé': {'region': 'Montreal', 'province': 'Quebec'},
    'Sainte-Anne-de-Bellevue': {'region': 'Montreal', 'province': 'Quebec'},
    'Senneville': {'region': 'Montreal', 'province': 'Quebec'},
    'Dollard-Des Ormeaux': {'region': 'Montreal', 'province': 'Quebec'},
    'Dollard-Des-Ormeaux': {'region': 'Montreal', 'province': 'Quebec'},
    'Pierrefonds': {'region': 'Montreal', 'province': 'Quebec'},
    'Roxboro': {'region': 'Montreal', 'province': 'Quebec'},
    'Lachine': {'region': 'Montreal', 'province': 'Quebec'},
    'Lasalle': {'region': 'Montreal', 'province': 'Quebec'},
    'LaSalle': {'region': 'Montreal', 'province': 'Quebec'},
    'Verdun': {'region': 'Montreal', 'province': 'Quebec'},
    'Outremont': {'region': 'Montreal', 'province': 'Quebec'},
    'Saint-Laurent': {'region': 'Montreal', 'province': 'Quebec'},
    'Saint-Leonard': {'region': 'Montreal', 'province': 'Quebec'},
    'Saint-Léonard': {'region': 'Montreal', 'province': 'Quebec'},
    'Anjou': {'region': 'Montreal', 'province': 'Quebec'},
    'Ahuntsic': {'region': 'Montreal', 'province': 'Quebec'},
    'Cartierville': {'region': 'Montreal', 'province': 'Quebec'},
    'Ville-Marie': {'region': 'Montreal', 'province': 'Quebec'},
    'Le Plateau-Mont-Royal': {'region': 'Montreal', 'province': 'Quebec'},
    'Rosemont': {'region': 'Montreal', 'province': 'Quebec'},
    'Villeray': {'region': 'Montreal', 'province': 'Quebec'},
    'Saint-Michel': {'region': 'Montreal', 'province': 'Quebec'},
    'Hochelaga': {'region': 'Montreal', 'province': 'Quebec'},
    'Maisonneuve': {'region': 'Montreal', 'province': 'Quebec'},
    'Mercier': {'region': 'Montreal', 'province': 'Quebec'},
    'Riviere-des-Prairies': {'region': 'Montreal', 'province': 'Quebec'},
    'Pointe-aux-Trembles': {'region': 'Montreal', 'province': 'Quebec'},

    # --- Laval ---
    'Laval': {'region': 'Laval', 'province': 'Quebec'},
    'Chomedey': {'region': 'Laval', 'province': 'Quebec'},
    'Sainte-Rose': {'region': 'Laval', 'province': 'Quebec'},
    'Fabreville': {'region': 'Laval', 'province': 'Quebec'},
    'Saint-Vincent-De-Paul': {'region': 'Laval', 'province': 'Quebec'},
    'Laval-Des-Rapides': {'region': 'Laval', 'province': 'Quebec'},
    'Sainte-Dorothee': {'region': 'Laval', 'province': 'Quebec'},
    'Vimont': {'region': 'Laval', 'province': 'Quebec'},
    'Auteuil': {'region': 'Laval', 'province': 'Quebec'},
    'Duvernay': {'region': 'Laval', 'province': 'Quebec'},
    'Pont-Viau': {'region': 'Laval', 'province': 'Quebec'},
    'Laval-Ouest': {'region': 'Laval', 'province': 'Quebec'},

    # --- Capitale-Nationale (Quebec City area) ---
    'Quebec': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Québec': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Quebec City': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Ville de Quebec': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Sainte-Foy': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Sillery': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Cap-Rouge': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Charlesbourg': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Beauport': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Limoilou': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Loretteville': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Val-Belair': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Saint-Emile': {'region': 'Capitale-Nationale', 'province': 'Quebec'},
    'Vanier': {'region': 'Capitale-Nationale', 'province': 'Quebec'},

    # --- Monteregie ---
    'Longueuil': {'region': 'Monteregie', 'province': 'Quebec'},
    'Boucherville': {'region': 'Monteregie', 'province': 'Quebec'},
    'Brossard': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Lambert': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Hubert': {'region': 'Monteregie', 'province': 'Quebec'},
    'Greenfield Park': {'region': 'Monteregie', 'province': 'Quebec'},
    'Vieux-Longueuil': {'region': 'Monteregie', 'province': 'Quebec'},
    'LeMoyne': {'region': 'Monteregie', 'province': 'Quebec'},

    'Saint-Hyacinthe': {'region': 'Monteregie', 'province': 'Quebec'},
    'Granby': {'region': 'Monteregie', 'province': 'Quebec'},
    'Chambly': {'region': 'Monteregie', 'province': 'Quebec'},
    'Vaudreuil-Dorion': {'region': 'Monteregie', 'province': 'Quebec'},
    'Vaudreuil': {'region': 'Monteregie', 'province': 'Quebec'},
    'Dorion': {'region': 'Monteregie', 'province': 'Quebec'},
    'L-Ile-Perrot': {'region': 'Monteregie', 'province': 'Quebec'},
    'Notre-Dame-De-L-Ile-Perrot': {'region': 'Monteregie', 'province': 'Quebec'},
    'Pincourt': {'region': 'Monteregie', 'province': 'Quebec'},
    'Terrasse-Vaudreuil': {'region': 'Monteregie', 'province': 'Quebec'},
    'Coteau-Du-Lac': {'region': 'Monteregie', 'province': 'Quebec'},
    'Les Coteaux': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Zotique': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Polycarpe': {'region': 'Monteregie', 'province': 'Quebec'},
    'Rigaud': {'region': 'Monteregie', 'province': 'Quebec'},
    'Hudson': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Lazare': {'region': 'Monteregie', 'province': 'Quebec'},

    'Salaberry-de-Valleyfield': {'region': 'Monteregie', 'province': 'Quebec'},
    'Valleyfield': {'region': 'Monteregie', 'province': 'Quebec'},
    'Beauharnois': {'region': 'Monteregie', 'province': 'Quebec'},
    'Sorel-Tracy': {'region': 'Monteregie', 'province': 'Quebec'},
    'Sorel': {'region': 'Monteregie', 'province': 'Quebec'},
    'Tracy': {'region': 'Monteregie', 'province': 'Quebec'},
    'Beloeil': {'region': 'Monteregie', 'province': 'Quebec'},
    'McMasterville': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Basile-le-Grand': {'region': 'Monteregie', 'province': 'Quebec'},
    'Mont-Saint-Hilaire': {'region': 'Monteregie', 'province': 'Quebec'},
    'Otterburn Park': {'region': 'Monteregie', 'province': 'Quebec'},
    'Carignan': {'region': 'Monteregie', 'province': 'Quebec'},
    'Chambly': {'region': 'Monteregie', 'province': 'Quebec'},
    'Richelieu': {'region': 'Monteregie', 'province': 'Quebec'},
    'Marieville': {'region': 'Monteregie', 'province': 'Quebec'},
    'Rougemont': {'region': 'Monteregie', 'province': 'Quebec'},
    'Sainte-Julie': {'region': 'Monteregie', 'province': 'Quebec'},
    'Sainte-Julienne': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Amable': {'region': 'Monteregie', 'province': 'Quebec'},
    'Varennes': {'region': 'Monteregie', 'province': 'Quebec'},
    'Vercheres': {'region': 'Monteregie', 'province': 'Quebec'},
    'Contrecoeur': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Sulpice': {'region': 'Monteregie', 'province': 'Quebec'},
    'Lavaltrie': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Jean-sur-Richelieu': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Jean': {'region': 'Monteregie', 'province': 'Quebec'},
    'Iberville': {'region': 'Monteregie', 'province': 'Quebec'},
    'Chateauguay': {'region': 'Monteregie', 'province': 'Quebec'},
    'Mercier': {'region': 'Monteregie', 'province': 'Quebec'},
    'Levis': {'region': 'Chaudiere-Appalaches', 'province': 'Quebec'},
    'Lévis': {'region': 'Chaudiere-Appalaches', 'province': 'Quebec'},
    'Saint-Jean-Chrysostome': {'region': 'Chaudiere-Appalaches', 'province': 'Quebec'},

    # --- Outaouais ---
    'Gatineau': {'region': 'Outaouais', 'province': 'Quebec'},
    'Hull': {'region': 'Outaouais', 'province': 'Quebec'},
    'Aylmer': {'region': 'Outaouais', 'province': 'Quebec'},
    'Buckingham': {'region': 'Outaouais', 'province': 'Quebec'},
    'Masson-Angers': {'region': 'Outaouais', 'province': 'Quebec'},
    'Cantley': {'region': 'Outaouais', 'province': 'Quebec'},
    'Chelsea': {'region': 'Outaouais', 'province': 'Quebec'},
    'La Peche': {'region': 'Outaouais', 'province': 'Quebec'},
    'L''Ange-Gardien': {'region': 'Outaouais', 'province': 'Quebec'},
    'Val-des-Monts': {'region': 'Outaouais', 'province': 'Quebec'},
    'Pontiac': {'region': 'Outaouais', 'province': 'Quebec'},
    'Shawville': {'region': 'Outaouais', 'province': 'Quebec'},
    'Campbells Bay': {'region': 'Outaouais', 'province': 'Quebec'},
    'Fort Coulonge': {'region': 'Outaouais', 'province': 'Quebec'},
    'Maniwaki': {'region': 'Outaouais', 'province': 'Quebec'},
    'Gracefield': {'region': 'Outaouais', 'province': 'Quebec'},
    'Papineauville': {'region': 'Outaouais', 'province': 'Quebec'},
    'Saint-Andre-Avellin': {'region': 'Outaouais', 'province': 'Quebec'},
    'Saint-André-Avellin': {'region': 'Outaouais', 'province': 'Quebec'},
    'Notre-Dame-de-la-Salette': {'region': 'Outaouais', 'province': 'Quebec'},
    'Ripon': {'region': 'Outaouais', 'province': 'Quebec'},
    'Montpellier': {'region': 'Outaouais', 'province': 'Quebec'},
    'Lac-des-Plages': {'region': 'Outaouais', 'province': 'Quebec'},
    'Duhamel': {'region': 'Outaouais', 'province': 'Quebec'},
    'Montebello': {'region': 'Outaouais', 'province': 'Quebec'},
    'Fassett': {'region': 'Outaouais', 'province': 'Quebec'},

    # --- Estrie ---
    'Sherbrooke': {'region': 'Estrie', 'province': 'Quebec'},
    'Magog': {'region': 'Estrie', 'province': 'Quebec'},
    'Coaticook': {'region': 'Estrie', 'province': 'Quebec'},
    'Windsor': {'region': 'Estrie', 'province': 'Quebec'},
    'Richmond': {'region': 'Estrie', 'province': 'Quebec'},
    'Asbestos': {'region': 'Estrie', 'province': 'Quebec'},
    'Lac-Megantic': {'region': 'Estrie', 'province': 'Quebec'},
    'Cookshire': {'region': 'Estrie', 'province': 'Quebec'},
    'East Angus': {'region': 'Estrie', 'province': 'Quebec'},
    'Danville': {'region': 'Estrie', 'province': 'Quebec'},

    # --- Lanaudiere ---
    'Terrebonne': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'Mascouche': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'Repentigny': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'Charlemagne': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'L''Assomption': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'Joliette': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'Notre-Dame-des-Prairies': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'Saint-Charles-Borromee': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'Rawdon': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'Saint-Felix-de-Valois': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'Berthierville': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'Lanoraie': {'region': 'Lanaudiere', 'province': 'Quebec'},
    'Saint-Gabriel': {'region': 'Lanaudiere', 'province': 'Quebec'},

    # --- Laurentides ---
    'Saint-Jerome': {'region': 'Laurentides', 'province': 'Quebec'},
    'Saint-Jérôme': {'region': 'Laurentides', 'province': 'Quebec'},
    'Mirabel': {'region': 'Laurentides', 'province': 'Quebec'},
    'Blainville': {'region': 'Laurentides', 'province': 'Quebec'},
    'Boisbriand': {'region': 'Laurentides', 'province': 'Quebec'},
    'Sainte-Therese': {'region': 'Laurentides', 'province': 'Quebec'},
    'Saint-Eustache': {'region': 'Laurentides', 'province': 'Quebec'},
    'Deux-Montagnes': {'region': 'Laurentides', 'province': 'Quebec'},
    'Sainte-Marthe-sur-le-Lac': {'region': 'Laurentides', 'province': 'Quebec'},
    'Pointe-Calumet': {'region': 'Laurentides', 'province': 'Quebec'},
    'Lachute': {'region': 'Laurentides', 'province': 'Quebec'},
    'Brownsburg': {'region': 'Laurentides', 'province': 'Quebec'},
    'Mont-Tremblant': {'region': 'Laurentides', 'province': 'Quebec'},
    'Sainte-Agathe-des-Monts': {'region': 'Laurentides', 'province': 'Quebec'},
    'Saint-Sauveur': {'region': 'Laurentides', 'province': 'Quebec'},
    'Saint-Sauveur-des-Monts': {'region': 'Laurentides', 'province': 'Quebec'},
    'Morin-Heights': {'region': 'Laurentides', 'province': 'Quebec'},
    'Piedmont': {'region': 'Laurentides', 'province': 'Quebec'},

    # --- Mauricie ---
    'Trois-Rivieres': {'region': 'Mauricie', 'province': 'Quebec'},
    'Trois-Rivières': {'region': 'Mauricie', 'province': 'Quebec'},
    'Shawinigan': {'region': 'Mauricie', 'province': 'Quebec'},
    'La Tuque': {'region': 'Mauricie', 'province': 'Quebec'},
    'Louiseville': {'region': 'Mauricie', 'province': 'Quebec'},

    # --- Centre-du-Quebec ---
    'Drummondville': {'region': 'Centre-Du-Quebec', 'province': 'Quebec'},
    'Victoriaville': {'region': 'Centre-Du-Quebec', 'province': 'Quebec'},
    'Nicolet': {'region': 'Centre-Du-Quebec', 'province': 'Quebec'},
    'Becancour': {'region': 'Centre-Du-Quebec', 'province': 'Quebec'},
    'Plessisville': {'region': 'Centre-Du-Quebec', 'province': 'Quebec'},
    'Princeville': {'region': 'Centre-Du-Quebec', 'province': 'Quebec'},

    # --- Chaudiere-Appalaches ---
    'Levis': {'region': 'Chaudiere-Appalaches', 'province': 'Quebec'},
    'Lévis': {'region': 'Chaudiere-Appalaches', 'province': 'Quebec'},
    'Saint-Georges': {'region': 'Chaudiere-Appalaches', 'province': 'Quebec'},
    'Thetford Mines': {'region': 'Chaudiere-Appalaches', 'province': 'Quebec'},
    'Sainte-Marie': {'region': 'Chaudiere-Appalaches', 'province': 'Quebec'},
    'Beauceville': {'region': 'Chaudiere-Appalaches', 'province': 'Quebec'},

    # --- Saguenay-Lac-Saint-Jean ---
    'Saguenay': {'region': 'Saguenay-Lac-Saint-Jean', 'province': 'Quebec'},
    'Chicoutimi': {'region': 'Saguenay-Lac-Saint-Jean', 'province': 'Quebec'},
    'Jonquiere': {'region': 'Saguenay-Lac-Saint-Jean', 'province': 'Quebec'},
    'La Baie': {'region': 'Saguenay-Lac-Saint-Jean', 'province': 'Quebec'},
    'Alma': {'region': 'Saguenay-Lac-Saint-Jean', 'province': 'Quebec'},
    'Dolbeau-Mistassini': {'region': 'Saguenay-Lac-Saint-Jean', 'province': 'Quebec'},
    'Roberval': {'region': 'Saguenay-Lac-Saint-Jean', 'province': 'Quebec'},
    'Saint-Felicien': {'region': 'Saguenay-Lac-Saint-Jean', 'province': 'Quebec'},

    # --- Bas-Saint-Laurent ---
    'Rimouski': {'region': 'Bas-Saint-Laurent', 'province': 'Quebec'},
    'Riviere-du-Loup': {'region': 'Bas-Saint-Laurent', 'province': 'Quebec'},
    'Matane': {'region': 'Bas-Saint-Laurent', 'province': 'Quebec'},
    'Mont-Joli': {'region': 'Bas-Saint-Laurent', 'province': 'Quebec'},

    # --- Gaspesie / Iles-de-la-Madeleine ---
    'Gaspe': {'region': 'Gaspesie-Iles-De-La-Madeleine', 'province': 'Quebec'},
    'Gaspé': {'region': 'Gaspesie-Iles-De-La-Madeleine', 'province': 'Quebec'},
    'Perce': {'region': 'Gaspesie-Iles-De-La-Madeleine', 'province': 'Quebec'},
    'Percé': {'region': 'Gaspesie-Iles-De-La-Madeleine', 'province': 'Quebec'},
    'Cap-Chat': {'region': 'Gaspesie-Iles-De-La-Madeleine', 'province': 'Quebec'},
    'Sainte-Anne-Des-Monts': {'region': 'Gaspesie-Iles-De-La-Madeleine', 'province': 'Quebec'},
    'Iles-De-La-Madeleine': {'region': 'Gaspesie-Iles-De-La-Madeleine', 'province': 'Quebec'},
    'Cap-aux-Meules': {'region': 'Gaspesie-Iles-De-La-Madeleine', 'province': 'Quebec'},
    'New Richmond': {'region': 'Gaspesie-Iles-De-La-Madeleine', 'province': 'Quebec'},
    'Bonaventure': {'region': 'Gaspesie-Iles-De-La-Madeleine', 'province': 'Quebec'},
    'Chandler': {'region': 'Gaspesie-Iles-De-La-Madeleine', 'province': 'Quebec'},

    # --- Abitibi-Temiscamingue ---
    'Val-d-Or': {'region': 'Abitibi-Temiscamingue', 'province': 'Quebec'},
    'Rouyn-Noranda': {'region': 'Abitibi-Temiscamingue', 'province': 'Quebec'},
    'Amos': {'region': 'Abitibi-Temiscamingue', 'province': 'Quebec'},
    'La Sarre': {'region': 'Abitibi-Temiscamingue', 'province': 'Quebec'},
    'Temiscaming': {'region': 'Abitibi-Temiscamingue', 'province': 'Quebec'},
    'Ville-Marie': {'region': 'Abitibi-Temiscamingue', 'province': 'Quebec'},

    # --- Cote-Nord ---
    'Sept-Iles': {'region': 'Cote-Nord', 'province': 'Quebec'},
    'Sept-Îles': {'region': 'Cote-Nord', 'province': 'Quebec'},
    'Baie-Comeau': {'region': 'Cote-Nord', 'province': 'Quebec'},
    'Port-Cartier': {'region': 'Cote-Nord', 'province': 'Quebec'},
    'Havre-Saint-Pierre': {'region': 'Cote-Nord', 'province': 'Quebec'},

    # --- Outaouais (additional) ---
    'Fassett': {'region': 'Outaouais', 'province': 'Quebec'},

    # --- Monteregie (additional) ---
    'Saint-Bruno': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Bruno-de-Montarville': {'region': 'Monteregie', 'province': 'Quebec'},
    'Saint-Constant': {'region': 'Monteregie', 'province': 'Quebec'},
    'Candiac': {'region': 'Monteregie', 'province': 'Quebec'},
    'Delson': {'region': 'Monteregie', 'province': 'Quebec'},
    'La Prairie': {'region': 'Monteregie', 'province': 'Quebec'},
    'Sainte-Catherine': {'region': 'Monteregie', 'province': 'Quebec'},

    # --- Estrie (additional) ---
    'Sutton': {'region': 'Estrie', 'province': 'Quebec'},
    'Lac-Brome': {'region': 'Estrie', 'province': 'Quebec'},
    'Knowlton': {'region': 'Estrie', 'province': 'Quebec'},
    'Brome': {'region': 'Estrie', 'province': 'Quebec'},
    'Bromont': {'region': 'Estrie', 'province': 'Quebec'},
    'Cowansville': {'region': 'Estrie', 'province': 'Quebec'},
    'Dunham': {'region': 'Estrie', 'province': 'Quebec'},
    'Farnham': {'region': 'Estrie', 'province': 'Quebec'},
    'Bedford': {'region': 'Estrie', 'province': 'Quebec'},
    'Lac-Brome': {'region': 'Estrie', 'province': 'Quebec'},
    'Fulford': {'region': 'Estrie', 'province': 'Quebec'},
    'Eastman': {'region': 'Estrie', 'province': 'Quebec'},
    'Potton': {'region': 'Estrie', 'province': 'Quebec'},
    'Mansonville': {'region': 'Estrie', 'province': 'Quebec'},

    # Outaouais additions
    'Les Collines-De-L-Outaouais': {'region': 'Outaouais', 'province': 'Quebec'},
    'Saint-Armand': {'region': 'Estrie', 'province': 'Quebec'},

    # Monteregie additions
    'Herouxville': {'region': 'Mauricie', 'province': 'Quebec'},
    'Hérouxville': {'region': 'Mauricie', 'province': 'Quebec'},
    'Saint-Tite': {'region': 'Mauricie', 'province': 'Quebec'},
    'Saint-Raymond': {'region': 'Capitale-Nationale', 'province': 'Quebec'},

    # Outaouais additions
    'Masson': {'region': 'Outaouais', 'province': 'Quebec'},
    'Angers': {'region': 'Outaouais', 'province': 'Quebec'},
    'Grenville': {'region': 'Laurentides', 'province': 'Quebec'},
    'Harrington': {'region': 'Laurentides', 'province': 'Quebec'},
}

# Combinar ambas referencias
CITY_REF = {}
CITY_REF.update(ONTARIO_CITIES)
CITY_REF.update(QUEBEC_CITIES)

# Normalizar nombres en la referencia (lowercase, sin acentos)
def normalize_name(name):
    if not name:
        return ''
    name = name.lower().strip()
    replacements = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'ä': 'a', 'ë': 'e', 'ï': 'i', 'ö': 'o', 'ü': 'u',
        'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
        'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u',
        'ç': 'c', 'ñ': 'n',
        "'": "'", '’': "'", '`': "'", '´': "'",
        '-': '-', '–': '-', '—': '-',
    }
    for old, new in replacements.items():
        name = name.replace(old, new)
    name = re.sub(r'\s+', ' ', name).strip()
    name = re.sub(r'[.*?]$', '', name)
    return name

# Indice normalizado para busqueda rapida
CITY_INDEX = {}
for city, info in CITY_REF.items():
    key = normalize_name(city)
    CITY_INDEX[key] = info
    # Tambien indexar por variantes comunes
    key_no_hyphen = key.replace('-', ' ').replace("'", '')
    CITY_INDEX[key_no_hyphen] = info

# =========================================================================
# 2. FUNCIONES DE PARSING DE DIRECCIONES CANADIENSES
# =========================================================================

# Regex para código postal canadiense
POSTAL_CODE_RE = re.compile(r'\b([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)\b')

# Regex para provincia en dirección
PROVINCE_RE = re.compile(
    r'\b(ON|Ontario|ONT|QC|Québec|Quebec|QUÉBEC|QUEBEC|BC|AB|MB|SK|NS|NB|NL|PE|NT|NU|YT)\b'
)

# Palabras que NO son nombres de ciudad
NON_CITY_WORDS = {
    'canada', 'canadá', 'canadâ',
    'suite', 'ste', 'bureau', 'unit', 'apt', 'app', 'box',
    'local', 'floor', 'etage', 'unité',
    'north', 'south', 'east', 'west',
}

# Palabras de direccion a rechazar como ciudad/pueblo
STREET_KEYWORDS_RE = re.compile(
    r'^\d+\s|^(street|st|avenue|ave|boulevard|boul|blvd|drive|dr|road|rd|'
    r'highway|hwy|route|rr|lot|concession|chemin|chem|rue|promenade|prom|'
    r'crescent|cres|court|crt|circle|cir|gate|gate|lane|ln|trail|'
    r'way|place|parkway|pkwy|terrace|terr|close|meadow|meadows|'
    r'ridge|view|heights|crest|wood|woods|garden|gardens|'
    r'bayou|cove|dale|field|fields|forest|glen|glade|grove|'
    r'hollow|hill|hills|isle|island|lake|lane|landing|'
    r'marsh|mews|mount|mountain|nest|oak|oaks|orchard|park|'
    r'pine|pines|point|pond|prairie|rise|run|springs|'
    r'valley|vista|walk|wall|way|wynd|yard)\b',
    re.IGNORECASE
)

def extract_postal_code(address):
    """Extrae el código postal canadiense de una dirección."""
    if not address:
        return None
    m = POSTAL_CODE_RE.search(address)
    if m:
        return m.group(1).upper() + ' ' + m.group(2).upper()
    return None

def extract_province_from_address(address):
    """Extrae la provincia (Ontario/Quebec) de la dirección."""
    if not address:
        return None
    # Buscar QC/Quebec
    if re.search(r'\bQC\b', address, re.IGNORECASE) or re.search(r'\bQuébec\b', address) or re.search(r'\bQUÉBEC\b', address):
        return 'Quebec'
    if re.search(r'\bQuebec\b', address) and not re.search(r'\bQuebec\b.*\b(?:City|Ville)\b', address, re.IGNORECASE):
        return 'Quebec'
    # Buscar ON/Ontario
    if re.search(r'\bON\b', address, re.IGNORECASE) or re.search(r'\bOntario\b', address):
        # Cuidado: "Ontario St" en Montreal podría ser calle
        if re.search(r'\b(?:St|Street|Ave|Avenue|Blvd|Boulevard)\s+Ontario\b', address, re.IGNORECASE):
            return None  # Es una calle Ontario, no provincia
        return 'Ontario'
    return None

def extract_province_from_postal(postal_code):
    """Deriva la provincia del código postal canadiense."""
    if not postal_code:
        return None
    first_letter = postal_code[0].upper()
    return POSTAL_PROVINCE.get(first_letter)

def extract_city_from_address(address):
    """
    Extrae la ciudad/pueblo de la dirección canadiense.
    Busca el último componente antes de la provincia.
    """
    if not address:
        return None

    # Remover código postal
    addr = POSTAL_CODE_RE.sub('', address).strip()
    # Remover "Canadá" / "Canada" al final
    addr = re.sub(r',?\s*Canad[áa]?\s*$', '', addr, flags=re.IGNORECASE)

    parts = [p.strip() for p in addr.split(',')]
    parts = [p for p in parts if p]

    if len(parts) < 2:
        return None

    # Buscar de atrás hacia adelante
    provincia_encontrada = None
    for i, part in enumerate(parts):
        p_upper = part.upper()
        if p_upper in ('ON', 'ONTARIO', 'QC', 'QUEBEC', 'QUÉBEC'):
            provincia_encontrada = i
            break

    # Si encontramos provincia, el componente anterior debería ser la ciudad
    if provincia_encontrada and provincia_encontrada > 0:
        candidate = parts[provincia_encontrada - 1]
        # Limpiar
        candidate = re.sub(r'[.,]+$', '', candidate).strip()
        if len(candidate) > 2 and not STREET_KEYWORDS_RE.match(candidate):
            return candidate

    # Si no encontramos provincia con abreviatura, buscar el patrón completo
    for i, part in enumerate(parts):
        if re.match(r'^(?:Province\s+de\s+)?(?:Ontario|Quebec|Québec)\s*$', part, re.IGNORECASE):
            if i > 0:
                candidate = parts[i - 1]
                candidate = re.sub(r'[.,]+$', '', candidate).strip()
                if len(candidate) > 2 and not STREET_KEYWORDS_RE.match(candidate):
                    return candidate
            break

    # Fallback: buscar el penúltimo componente SOLO si hay indicio de provincia
    tiene_provincia = any(
        p.upper() in ('ON', 'ONTARIO', 'QC', 'QUEBEC', 'QUÉBEC') or 
        re.match(r'^(?:Province\s+de\s+)?(?:Ontario|Quebec|Québec)\s*$', p, re.IGNORECASE)
        for p in parts
    )
    tiene_postal = bool(POSTAL_CODE_RE.search(address))
    tiene_canada = bool(re.search(r'Canad[áa]?$', address, re.IGNORECASE))

    if tiene_provincia or tiene_postal or tiene_canada:
        if len(parts) >= 2:
            candidate = parts[-2]
            candidate = re.sub(r'[.,]+$', '', candidate).strip()
            if len(candidate) > 2 and not STREET_KEYWORDS_RE.fullmatch(candidate) and candidate.lower() not in NON_CITY_WORDS:
                return candidate

    return None

def extract_town_from_address(address):
    """Extrae el pueblo/localidad de la dirección. Similar a ciudad pero más detallado."""
    if not address:
        return None
    return extract_city_from_address(address)

def lookup_city(name):
    """Busca una ciudad en la referencia geográfica."""
    if not name:
        return None
    key = normalize_name(name)
    if key in CITY_INDEX:
        return CITY_INDEX[key]

    # Intentar variantes
    key_no_saint = key.replace('st.', 'saint').replace('ste.', 'sainte')
    if key_no_saint in CITY_INDEX:
        return CITY_INDEX[key_no_saint]

    key_clean = re.sub(r'[^a-z0-9\s\'-]', '', key)
    if key_clean in CITY_INDEX:
        return CITY_INDEX[key_clean]

    return None

# =========================================================================
# 3. CLASE PRINCIPAL DE VALIDACIÓN
# =========================================================================

class GeographicValidator:
    def __init__(self):
        self.stats = {
            'total': 0,
            'provincia_corrected': 0,
            'region_corrected': 0,
            'ciudad_corrected': 0,
            'pueblo_corrected': 0,
            'provincia_ok': 0,
            'region_ok': 0,
            'ciudad_ok': 0,
            'pueblo_ok': 0,
            'no_address': 0,
            'low_confidence': 0,
            'review_manual': 0,
        }
        self.corrections = []
        self.errors = []

    def validate_record(self, record, tablename):
        """Valida un registro completo y devuelve las correcciones."""
        self.stats['total'] += 1

        result = {
            'id': record['id'],
            'nombre': record['nombre'],
            'tabla': tablename,
            'provincia_original': record.get('provincia', ''),
            'region_original': record.get('region', ''),
            'ciudad_original': record.get('ciudad', ''),
            'pueblo_original': record.get('pueblo', ''),
            'provincia_corrected': False,
            'region_corrected': False,
            'ciudad_corrected': False,
            'pueblo_corrected': False,
            'provincia_new': None,
            'region_new': None,
            'ciudad_new': None,
            'pueblo_new': None,
            'nivel_confianza': 'ALTO',
            'motivo': [],
        }

        direccion = (record.get('direccion') or '').strip()
        if not direccion or direccion.lower() in ('null', '', 'no disponible', 'succursales multiples – québec', 'succursales multiples – quebec', 'succursales multiples – quebec'):
            self.stats['no_address'] += 1
            result['nivel_confianza'] = 'BAJO'
            result['motivo'].append('Sin dirección para validar')
            return result

        # Extraer información de la dirección
        provincia_from_addr = extract_province_from_address(direccion)
        postal_code = extract_postal_code(direccion)
        provincia_from_postal = extract_province_from_postal(postal_code) if postal_code else None
        ciudad_from_addr = extract_city_from_address(direccion)

        # Determinar provincia correcta
        provincia_correcta = None
        if provincia_from_addr:
            provincia_correcta = provincia_from_addr
        elif provincia_from_postal:
            provincia_correcta = provincia_from_postal
            result['motivo'].append(f'Provincia inferida del código postal {postal_code}')

        # --- Validar PROVINCIA ---
        provincia_actual = (record.get('provincia') or '').strip()
        if provincia_correcta and provincia_actual:
            if normalize_name(provincia_actual) != normalize_name(provincia_correcta):
                result['provincia_corrected'] = True
                result['provincia_new'] = provincia_correcta
                result['motivo'].append(
                    f'Dirección indica {provincia_correcta}, registro tenía {provincia_actual}'
                )
            else:
                result['provincia_ok'] = True
                self.stats['provincia_ok'] += 1
        elif provincia_correcta and not provincia_actual:
            result['provincia_corrected'] = True
            result['provincia_new'] = provincia_correcta
            result['motivo'].append(f'Provincia faltante, asignada {provincia_correcta} desde dirección')
        elif not provincia_correcta and provincia_actual:
            result['motivo'].append(f'Dirección no indica provincia claramente, se mantiene "{provincia_actual}"')
            result['nivel_confianza'] = 'MEDIO'

        # --- Validar CIUDAD ---
        ciudad_actual = (record.get('ciudad') or '').strip()
        ciudad_de_referencia = None
        ciudad_info = None

        if ciudad_from_addr:
            ciudad_info = lookup_city(ciudad_from_addr)
            if ciudad_info:
                ciudad_de_referencia = ciudad_from_addr

        if ciudad_de_referencia:
            ciudad_norm_actual = normalize_name(ciudad_actual) if ciudad_actual else ''
            ciudad_norm_ref = normalize_name(ciudad_de_referencia)

            if not ciudad_actual:
                result['ciudad_corrected'] = True
                result['ciudad_new'] = ciudad_de_referencia
                result['motivo'].append(f'Ciudad faltante, asignada "{ciudad_de_referencia}" desde dirección')
                ciudad_actual = ciudad_de_referencia
            elif ciudad_norm_actual != ciudad_norm_ref:
                # PRIORIDAD: la direccion tiene mayor prioridad que los datos actuales
                # Aunque la ciudad actual sea valida, si la direccion indica otra, usar la de la direccion
                result['ciudad_corrected'] = True
                result['ciudad_new'] = ciudad_de_referencia
                motivo_adicional = f' (registro tenía "{ciudad_actual}")'
                if lookup_city(ciudad_actual):
                    motivo_adicional += ' - direccion tiene prioridad'
                result['motivo'].append(
                    f'Dirección indica "{ciudad_de_referencia}"{motivo_adicional}'
                )
                ciudad_actual = ciudad_de_referencia
            else:
                result['ciudad_ok'] = True
                self.stats['ciudad_ok'] += 1
        elif ciudad_actual:
            result['motivo'].append(f'Ciudad "{ciudad_actual}" mantenida (no extraíble de dirección)')
            result['nivel_confianza'] = 'MEDIO'

        # --- Validar REGIÓN ---
        region_actual = (record.get('region') or '').strip()
        region_correcta = None

        # Obtener la región de la referencia de ciudad
        ciudad_efectiva = ciudad_actual or ciudad_de_referencia or ''
        if ciudad_efectiva:
            ciudad_info = lookup_city(ciudad_efectiva)
            if ciudad_info and 'region' in ciudad_info:
                region_correcta = ciudad_info['region']

        if region_correcta:
            region_norm_actual = normalize_name(region_actual) if region_actual else ''
            region_norm_ref = normalize_name(region_correcta)

            if not region_actual:
                result['region_corrected'] = True
                result['region_new'] = region_correcta
                result['motivo'].append(f'Región faltante, asignada "{region_correcta}" según ciudad')
            elif region_norm_actual != region_norm_ref:
                # Regiones que son equivalentes
                region_equivalencias = {
                    'greater toronto area': ['toronto', 'toronto division', 'toronto district', 'great area toronto'],
                    'niagara region': ['niagara', 'niagara peninsula'],
                    'waterloo region': ['waterloo'],
                    'peel region': ['peel'],
                    'durham region': ['durham'],
                    'halton region': ['halton'],
                    'york region': ['york'],
                    'ottawa': ['ottawa division', 'ottawa district'],
                    'hamilton': ['hamilton division', 'hamilton region'],
                    'simcoe county': ['simcoe', 'simcoe region'],
                    'middlesex county': ['middlesex', 'london'],
                    'essex county': ['essex', 'windsor'],
                    'frontenac county': ['frontenac', 'kingston'],
                    'leeds and grenville': ['leeds and grenville united counties', 'leeds and grenville'],
                    'montreal': ['montréal', 'isla de montreal'],
                    'monteregie': ['moteregie', 'montéregie'],
                    'capitale-nationale': ['capitale-national', 'la capitale-nationale'],
                    'chaudiere-appalaches': ['chaudiere‑appalaches'],
                    'centre-du-quebec': ['centru-du-quebec'],
                    'muskoka district': ['muskoka'],
                    'grey county': ['grey'],
                    'bruce county': ['bruce'],
                    'hastings county': ['hastings'],
                    'lambton county': ['lambton'],
                    'elgin county': ['elgin'],
                    'perth county': ['perth'],
                    'wellington county': ['wellington'],
                    'haldimand county': ['haldimand'],
                    'norfolk county': ['norfolk'],
                    'northumberland county': ['northumberland'],
                    'peterborough county': ['peterborough'],
                    'prescott and russell': ['prescott and russell united'],
                    'stormont, dundas and glengarry': ['stormont dundas and glengarry', 'stormont, dundas & glengarry'],
                    'nipissing district': ['nipissing'],
                    'algoma district': ['algoma'],
                    'cochrane district': ['cochrane'],
                    'timiskaming district': ['timiskaming'],
                    'thunder bay district': ['thunder bay'],
                    'manitoulin district': ['manitoulin'],
                    'rainy river district': ['rainy river'],
                    'kenora district': ['kenora'],
                    'parry sound district': ['parry sound'],
                    'southwestern ontario': ['southwestern on', 'sur de ontario'],
                    'eastern ontario': ['eastern ont'],
                    'central ontario': ['central ont'],
                    'saguenay-lac-saint-jean': ['saguenay', 'sagueney'],
                    'gaspesie-iles-de-la-madeleine': ['gaspesie- iles-de-la-madeleine'],
                    'laurentides': ['regimen des laurentides', 'région des laurentides'],
                }

                region_norm_actual_clean = region_norm_actual
                is_equivalent = False
                for canonical, variants in region_equivalencias.items():
                    if region_norm_ref == canonical and region_norm_actual_clean in variants:
                        is_equivalent = True
                        break
                    if region_norm_actual_clean == canonical and region_norm_ref in variants:
                        is_equivalent = True
                        break

                if is_equivalent:
                    if region_norm_actual_clean != region_norm_ref:
                        result['region_corrected'] = True
                        result['region_new'] = region_correcta
                        result['motivo'].append(
                            f'Región normalizada: "{region_actual}" → "{region_correcta}"'
                        )
                    else:
                        result['region_ok'] = True
                        self.stats['region_ok'] += 1
                else:
                    result['region_corrected'] = True
                    result['region_new'] = region_correcta
                    result['motivo'].append(
                        f'Región corregida: "{region_actual}" → "{region_correcta}" según ciudad'
                    )
            else:
                result['region_ok'] = True
                self.stats['region_ok'] += 1
        elif region_actual:
            result['motivo'].append(f'Región "{region_actual}" mantenida (ciudad no en referencia)')
            result['nivel_confianza'] = 'MEDIO'

        # --- Validar PUEBLO ---
        pueblo_actual = (record.get('pueblo') or '').strip()
        pueblo_from_addr = extract_town_from_address(direccion)
        # Solo usar pueblo de direccion si la direccion tiene contexto completo
        # (provincia, codigo postal, o Canada)
        addr_has_context = bool(POSTAL_CODE_RE.search(direccion)) or \
            bool(re.search(r'\b(?:ON|Ontario|QC|Quebec|Québec|Canada|Canadá)\b', direccion))

        if pueblo_from_addr and addr_has_context:
            # Si el pueblo actual es una calle, corregir
            if pueblo_actual and STREET_KEYWORDS_RE.match(pueblo_actual):
                result['pueblo_corrected'] = True
                result['pueblo_new'] = pueblo_from_addr
                result['motivo'].append(
                    f'Pueblo contenía dirección ("{pueblo_actual}"), corregido a "{pueblo_from_addr}"'
                )

            elif not pueblo_actual:
                # Si no difiere de la ciudad, no asignar
                ciudad_efectiva_norm = normalize_name(ciudad_efectiva)
                pueblo_norm = normalize_name(pueblo_from_addr)
                if pueblo_norm != ciudad_efectiva_norm:
                    result['pueblo_corrected'] = True
                    result['pueblo_new'] = pueblo_from_addr
                    result['motivo'].append(f'Pueblo faltante, asignado "{pueblo_from_addr}" desde dirección')
                else:
                    result['pueblo_ok'] = True
                    self.stats['pueblo_ok'] += 1
            elif normalize_name(pueblo_actual) == normalize_name(pueblo_from_addr):
                result['pueblo_ok'] = True
                self.stats['pueblo_ok'] += 1
            elif STREET_KEYWORDS_RE.match(pueblo_actual):
                result['pueblo_corrected'] = True
                result['pueblo_new'] = pueblo_from_addr
                result['motivo'].append(
                    f'Pueblo contenía dirección ("{pueblo_actual}"), corregido a "{pueblo_from_addr}"'
                )
            elif lookup_city(pueblo_actual):
                # El pueblo actual es una ciudad válida - mantener
                result['pueblo_ok'] = True
                self.stats['pueblo_ok'] += 1
            else:
                # Podría ser diferente - verificar
                result['pueblo_corrected'] = True
                result['pueblo_new'] = pueblo_from_addr
                result['motivo'].append(
                    f'Pueblo corregido: "{pueblo_actual}" → "{pueblo_from_addr}"'
                )

        # --- Determinar confianza ---
        if result['nivel_confianza'] == 'ALTO' and any([
            result['ciudad_corrected'] and not ciudad_from_addr,
            result['provincia_corrected'] and not provincia_correcta,
        ]):
            result['nivel_confianza'] = 'MEDIO'

        # Actualizar stats
        for field in ['provincia', 'region', 'ciudad', 'pueblo']:
            if result[f'{field}_corrected']:
                self.stats[f'{field}_corrected'] += 1

        self.corrections.append(result)
        return result

    def print_report(self):
        """Genera reporte detallado de validación."""
        total = self.stats['total']
        print(f"\n{'='*70}")
        print(f"REPORTE DE VALIDACIÓN GEOGRÁFICA")
        print(f"{'='*70}")
        print(f"Total registros procesados: {total}")
        print(f"Registros sin dirección:     {self.stats['no_address']} ({self.stats['no_address']/total*100:.1f}%)")
        print(f"\n--- Correcciones aplicadas ---")
        for field, label in [('provincia', 'Provincia'), ('region', 'Región'),
                              ('ciudad', 'Ciudad'), ('pueblo', 'Pueblo')]:
            count = self.stats[f'{field}_corrected']
            print(f"  {label}: {count} corregidos ({count/total*100:.1f}%)")
        print(f"\n--- Niveles de confianza ---")
        print(f"  ALTO:   {self.stats['total'] - self.stats['low_confidence'] - self.stats['no_address']}")
        print(f"  MEDIO:  {self.stats['low_confidence']}")
        print(f"  BAJO:   {self.stats['no_address']}")

        # Ejemplos de correcciones
        corregidos = [c for c in self.corrections if any([c['provincia_corrected'], c['region_corrected'], c['ciudad_corrected'], c['pueblo_corrected']])]
        print(f"\n--- Ejemplos de correcciones ({min(10, len(corregidos))}) ---")
        for c in corregidos[:10]:
            cambios = []
            if c['provincia_corrected']:
                cambios.append(f"Prov: {c['provincia_original']}→{c['provincia_new']}")
            if c['region_corrected']:
                cambios.append(f"Reg: {c['region_original']}→{c['region_new']}")
            if c['ciudad_corrected']:
                cambios.append(f"Ciu: {c['ciudad_original']}→{c['ciudad_new']}")
            if c['pueblo_corrected']:
                cambios.append(f"Pue: {c['pueblo_original']}→{c['pueblo_new']}")
            print(f"  [{c['tabla']}] {c['nombre'][:40]}: {', '.join(cambios)}")

        # Registros que necesitan revisión manual
        revisar = [c for c in self.corrections if c['nivel_confianza'] in ('BAJO', 'REVISAR')]
        print(f"\n--- Registros que requieren revisión manual ({len(revisar)}) ---")
        for c in revisar[:10]:
            print(f"  [{c['tabla']}] {c['id']} - {c['nombre'][:40]}")

        # Resumen de provincias incorrectas
        prov_incorrectas = [(c['tabla'], c['provincia_original'], c['provincia_new'])
                           for c in self.corrections if c['provincia_corrected']]
        if prov_incorrectas:
            print(f"\n--- Provincias corregidas ({len(prov_incorrectas)} registros) ---")
            tabla_counts = defaultdict(int)
            for t, orig, new in prov_incorrectas:
                tabla_counts[f"{t}: {orig} → {new}"] += 1
            for desc, cnt in sorted(tabla_counts.items(), key=lambda x: -x[1])[:10]:
                print(f"  {desc}: {cnt} registros")

    def export_corrections_csv(self, path):
        """Exporta todas las correcciones a CSV."""
        with open(path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'id', 'tabla', 'nombre',
                'provincia_original', 'provincia_corregida',
                'region_original', 'region_corregida',
                'ciudad_original', 'ciudad_corregida',
                'pueblo_original', 'pueblo_corregido',
                'nivel_confianza', 'motivo'
            ])
            for c in self.corrections:
                writer.writerow([
                    c['id'], c['tabla'], c['nombre'],
                    c['provincia_original'], c['provincia_new'] if c['provincia_corrected'] else '',
                    c['region_original'], c['region_new'] if c['region_corrected'] else '',
                    c['ciudad_original'], c['ciudad_new'] if c['ciudad_corrected'] else '',
                    c['pueblo_original'], c['pueblo_new'] if c['pueblo_corrected'] else '',
                    c['nivel_confianza'], '; '.join(c['motivo'])
                ])
        print(f"\nCorrecciones exportadas a: {path}")

    def get_updates(self):
        """Prepara las sentencias UPDATE para aplicar en DB."""
        updates = {'ontario_companies': [], 'quebec_companies': []}
        for c in self.corrections:
            tabla = c['tabla']
            fields = {}
            if c['provincia_corrected'] and c['provincia_new']:
                fields['provincia'] = c['provincia_new']
            if c['region_corrected'] and c['region_new']:
                fields['region'] = c['region_new']
            if c['ciudad_corrected'] and c['ciudad_new']:
                fields['ciudad'] = c['ciudad_new']
            if c['pueblo_corrected'] and c['pueblo_new']:
                fields['pueblo'] = c['pueblo_new']
            if fields:
                updates[tabla].append({'id': c['id'], 'fields': fields})
        return updates


# =========================================================================
# 4. PROCESAMIENTO PRINCIPAL
# =========================================================================

def process_csv(filepath, tablename, validator):
    """Procesa un archivo CSV y valida cada registro."""
    count = 0
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='|')
        for row in reader:
            validator.validate_record(row, tablename)
            count += 1
            if count % 1000 == 0:
                print(f"  Procesados {count} registros de {tablename}...")
    return count


def apply_fix_db(updates, dry_run=True):
    """Aplica las correcciones a la base de datos."""
    import psycopg2

    DATABASE_URL = os.environ.get('DATABASE_URL', '')
    if not DATABASE_URL:
        # Intentar leer del .env
        env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith('DATABASE_URL='):
                        DATABASE_URL = line.strip().split('=', 1)[1]
                        break

    if not DATABASE_URL:
        print("ERROR: DATABASE_URL no configurada")
        return

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    total_updates = sum(len(v) for v in updates.values())
    print(f"\n{'='*70}")
    print(f"{'SIMULACIÓN' if dry_run else 'APLICANDO'} {total_updates} correcciones en DB")
    print(f"{'='*70}")

    applied = 0
    for tabla, records in updates.items():
        print(f"\n  Tabla: {tabla} ({len(records)} correcciones)")
        for rec in records:
            set_parts = []
            values = []
            for field, value in rec['fields'].items():
                set_parts.append(f"{field} = %s")
                values.append(value)
            set_parts.append("updated_at = NOW()")
            values.append(rec['id'])

            sql = f"UPDATE {tabla} SET {', '.join(set_parts)} WHERE id = %s"

            if dry_run:
                if applied < 5:
                    print(f"    [{tabla[:3]}] ID={rec['id'][:8]}... SET {rec['fields']}")
            else:
                try:
                    cur.execute(sql, values)
                    applied += 1
                    if applied % 500 == 0:
                        conn.commit()
                        print(f"    {applied} updates aplicados...")
                except Exception as e:
                    print(f"    ERROR: {e}")

    if not dry_run:
        conn.commit()
        print(f"\n  ✓ {applied} correcciones aplicadas exitosamente")
    else:
        print(f"\n  Modo simulación. Para aplicar: python validate-geographic-data.py --fix")

    cur.close()
    conn.close()


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Validar y corregir datos geográficos')
    parser.add_argument('--fix', action='store_true', help='Aplicar correcciones en DB')
    parser.add_argument('--csv-fix', action='store_true', help='Generar CSVs corregidos')
    parser.add_argument('--report', type=str, default='/tmp/corrections_report.csv',
                       help='Ruta del reporte CSV (default: /tmp/corrections_report.csv)')
    args = parser.parse_args()

    # Configurar rutas
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.join(script_dir, '..')

    ontario_csv = '/tmp/ontario_companies.csv'
    quebec_csv = '/tmp/quebec_companies.csv'

    if not os.path.exists(ontario_csv) or not os.path.exists(quebec_csv):
        print("ERROR: Archivos CSV no encontrados. Ejecuta primero:")
        print("  PGPASSWORD=casaos psql -h 127.0.0.1 -p 5432 -U casaos -d casaos")
        print("  \\copy ontario_companies TO '/tmp/ontario_companies.csv' WITH (FORMAT CSV, HEADER, DELIMITER '|');")
        print("  \\copy quebec_companies TO '/tmp/quebec_companies.csv' WITH (FORMAT CSV, HEADER, DELIMITER '|');")
        sys.exit(1)

    print(f"Iniciando validación geográfica...")
    print(f"  Ontario: {ontario_csv}")
    print(f"  Quebec:  {quebec_csv}")

    validator = GeographicValidator()

    print(f"\nProcesando Ontario...")
    on_count = process_csv(ontario_csv, 'ontario_companies', validator)

    print(f"\nProcesando Quebec...")
    qc_count = process_csv(quebec_csv, 'quebec_companies', validator)

    # Reporte
    validator.print_report()

    # Exportar correcciones
    validator.export_corrections_csv(args.report)

    # Aplicar correcciones
    updates = validator.get_updates()
    total_corrections = sum(len(v) for v in updates.values())
    print(f"\nTotal de registros con correcciones: {total_corrections}")

    if args.fix:
        apply_fix_db(updates, dry_run=False)
    else:
        apply_fix_db(updates, dry_run=True)

    print(f"\n{'='*70}")
    print(f"VALIDACIÓN COMPLETADA")
    print(f"{'='*70}")


if __name__ == '__main__':
    main()
