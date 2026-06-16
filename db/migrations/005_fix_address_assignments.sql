-- ═══════════════════════════════════════════════════════════════════════
-- Migration 005: Corregir asignación de ciudad, region y pueblo
-- Basado en análisis de datos: muchos registros tienen nombres de región
-- o MRC en el campo ciudad en lugar del nombre real de la ciudad/pueblo
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. ONTARIO: Si ciudad es una región/area pero pueblo tiene el valor real ──
-- Casi todos estos registros tienen el pueblo correcto en el campo pueblo
WITH region_names AS (
  SELECT unnest(ARRAY[
    'Peel', 'York', 'Simcoe County', 'Simcoe', 'Durham', 'Halton', 'Oxford',
    'Leeds And Grenville', 'Leeds and Grenville', 'Leeds And Grenville United',
    'Prescott And Russell United', 'Prescott-Russell', 'Prescott And Russell',
    'Lanark', 'United Counties Of Leeds And Grenville',
    'United Counties Of Prescott And Russell',
    'United Counties Of Stormont Dundas And Glengarry',
    'Stormont Dundas And Glenga', 'Stormont Dundas And Glengarry',
    'Stormont, Dundas And Glengarry', 'Stormont, Dundas & Glengarry',
    'Lanark County', 'Ottawa Valley', 'Renfrew County', 'Parry Sound',
    'Frontenac County', 'Frontenac', 'Middlesex County', 'Middlesex',
    'Essex', 'Essex County', 'Norfolk County', 'Northumberland County',
    'Northumberland', 'Perth County', 'Perth', 'Dufferin County',
    'Grey County', 'Grey', 'Bruce County', 'Bruce', 'Huron County',
    'Hastings County', 'Hastings', 'Lambton County', 'Lambton',
    'Elgin County', 'Chatham-Kent', 'Haliburton', 'Algoma',
    'Cochrane', 'Nipissing', 'Timiskaming', 'Kenora', 'Rainy River',
    'Manitoulin', 'Algoma District', 'Cochrane District', 'Nipissing District',
    'Manitoulin District', 'Muskoka District', 'Muskoka',
    'Greater Sudbury', 'Sudbury', 'Thunder Bay', 'Thunder Bay District',
    'Waterloo Region', 'York Region', 'Halton Region', 'Peel Region',
    'Niagara Region', 'Niagara', 'Niagara Peninsula',
    'Great Area Toronto', 'Greater Toronto Area', 'Greater Toronto',
    'Toronto Division', 'Toronto District',
    'Hamilton Division', 'Hamilton', 'Hamilton Region',
    'London', 'Ottawa Division', 'Ottawa District',
    'Central Ontario', 'Eastern Ontario', 'Southwestern Ontario',
    'Southern Ontario', 'Southwestern On',
    'Lake Erie Shore', 'Lake St Clair', 'Seaway Region', 'Seaway region',
    'Monteregie', 'Outaouais',
    'Brome-Missisquoi', 'Papineau',
    'La Vallee-De-La-Gatineau', 'Les Collines-De-L-Outaouais',
    'Beauharnois-Salaberry', 'Leeds And Greville',
    'North York', 'Etobicoke', 'Scarborough',
    'Brant', 'Brant County', 'County Of Brant',
    'Wellington County', 'Wellington',
    'Leeds And Grenville United',
    'United Counties Of Leeds',
    'Ontario',
    'Norfolk / Unclear',
    'Hamilton*', 'Collingwood*', 'Toronto (Etobicoke)', 'Toronto (Scarborough)',
    'Guelph / Wellington County', 'Hamilton / City Of Hamilton',
    'Kingston / Frontenac County',
    'Grey County (Grey Highlands)',
    'Ottawa / Ottawa Division',
    'Essex (Por Confirmar)*',
    'Muskoka District (¿?)',
    'Sault Ste. Marie,',
    'Thunder Bay,',
    'Ottawa-Rideau', 'Ottawa (Suburbio Rural)',
    '(Falta Ciudad, No Suficiente Info)',
    'Nort', 'Nort '
  ]) AS name
)
UPDATE ontario_companies oc
SET ciudad = normalize_location_name(oc.pueblo)
FROM region_names rn
WHERE normalize_location_name(oc.ciudad) = normalize_location_name(rn.name)
  AND oc.pueblo IS NOT NULL AND TRIM(oc.pueblo) <> '' AND TRIM(oc.pueblo) <> 'null'
  AND normalize_location_name(oc.ciudad) != normalize_location_name(oc.pueblo);

-- ── 2. ONTARIO: Ciudad con nombre de región sin pueblo → intentar extraer de dirección ──
UPDATE ontario_companies oc
SET ciudad = SUBSTRING(oc.direccion FROM ',\s*([A-Za-z\u00C0-\u024F\s''-]+)\s*,\s*(?:ON|Ontario)')
WHERE normalize_location_name(oc.ciudad) IN (
  SELECT normalize_location_name(name) FROM (VALUES
    ('Peel'), ('York'), ('Simcoe County'), ('Simcoe'), ('Durham'), ('Halton'), ('Oxford'),
    ('Leeds And Grenville'), ('Prescott And Russell United'), ('Lanark'),
    ('Greater Toronto Area'), ('Great Area Toronto'),
    ('Central Ontario'), ('Eastern Ontario'), ('Southwestern Ontario'),
    ('North York'), ('Etobicoke'), ('Scarborough'),
    ('Waterloo Region'), ('York Region'), ('Halton Region'), ('Peel Region'),
    ('Niagara Region'), ('Niagara'), ('Hamilton'), ('Toronto Division'),
    ('Lake Erie Shore'), ('Seaway Region'), ('Ottawa Valley'),
    ('Brant'), ('Wellington County'), ('Wellington'),
    ('Middlesex County'), ('Essex'), ('Essex County'),
    ('Norfolk County'), ('Northumberland'), ('Northumberland County'),
    ('Perth County'), ('Renfrew County'), ('Frontenac County'), ('Frontenac'),
    ('Parry Sound'), ('Muskoka'), ('Muskoka District'),
    ('Algoma'), ('Algoma District'), ('Greater Sudbury'), ('Sudbury'),
    ('Cochrane'), ('Cochrane District'), ('Nipissing'), ('Nipissing District'),
    ('Timiskaming'), ('Thunder Bay'), ('Thunder Bay District'),
    ('Manitoulin'), ('Manitoulin District'), ('Kenora'), ('Rainy River'),
    ('Haliburton'), ('Grey County'), ('Grey'), ('Grey County (Grey Highlands)'),
    ('Bruce County'), ('Bruce'), ('Huron County'), ('Hastings County'), ('Hastings'),
    ('Lambton County'), ('Lambton'), ('Elgin County'), ('Dufferin County'),
    ('Chatham-Kent'), ('London'), ('Toronto District'),
    ('Hamilton Division'), ('Ottawa Division'), ('Ottawa District'),
    ('Hamilton Region'), ('Hamilton / City Of Hamilton'),
    ('Brant County'), ('County Of Brant'), ('Ontario'),
    ('Monteregie'), ('Outaouais'),
    ('Brome-Missisquoi'), ('Papineau'),
    ('La Vallee-De-La-Gatineau'), ('Les Collines-De-L-Outaouais'),
    ('Beauharnois-Salaberry'), ('Waterloo'),
    ('Southern Ontario'), ('Southwestern On'),
    ('Lake St Clair'),
    ('Great Area Toronto'), ('Greater Toronto'),
    ('Sault Ste. Marie,'), ('Thunder Bay,'),
    ('Ottawa-Rideau'), ('Ottawa (Suburbio Rural)'),
    ('Norfolk / Unclear'),
    ('Hamilton*'), ('Collingwood*'),
    ('Toronto (Etobicoke)'), ('Toronto (Scarborough)'),
    ('Guelph / Wellington County'),
    ('Kingston / Frontenac County'),
    ('Ottawa / Ottawa Division'),
    ('Essex (Por Confirmar)*'),
    ('Muskoka District (¿?)'),
    ('(Falta Ciudad, No Suficiente Info)')
  ) AS v(name)
)
  AND (oc.pueblo IS NULL OR TRIM(oc.pueblo) = '' OR TRIM(oc.pueblo) = 'null')
  AND oc.direccion IS NOT NULL AND TRIM(oc.direccion) <> '' AND TRIM(oc.direccion) <> 'null'
  AND oc.direccion ~ ',\s*[A-Za-z\u00C0-\u024F\s''-]+,\s*(?:ON|Ontario)';

-- ── 3. QUEBEC: MRC/borough names → usar pueblo (que tiene la ciudad/pueblo real) ──
-- Casi todos estos registros tienen el pueblo correcto en el campo pueblo
UPDATE quebec_companies qc
SET ciudad = normalize_location_name(qc.pueblo)
WHERE normalize_location_name(qc.ciudad) IN (
  -- MRCs
  'Les Maskoutains', 'Brome-Missisquoi', 'Vaudreuil-Soulanges',
  'La Haute-Yamaska', 'Roussillon', 'Drummond', 'Arthabaska',
  'Lotbiniere', 'L-Erable', 'Les Appalaches', 'Les Pays-D-En-Haut',
  'Le Haut-Richelieu', 'La Vallee-Du-Richelieu', 'Les Moulins',
  'Rouville', 'Memphremagog', 'Montcalm',
  'Les Jardins-De-Napierville', 'Maskinonge', 'Acton',
  'Becancour', 'Alto Yamaska', 'Le Haut-Saint-Francois',
  'Beauharnois-Salaberry', 'Pierre-De Saurel',
  'Le Val-Saint-Francois', 'Bellechasse', 'Les Chenaux',
  'La Jacques-Cartier', 'Nicolet-Yamaska', 'Alto Richelieu',
  'Charlevoix', 'Charlevoix-Est', 'Argenteuil', 'Portneuf',
  'Antoine-Labelle', 'Le Haut-Saint-Laurent', 'La Haute-Richelieu',
  'Desjardins', 'Matawinie', 'Papineau', 'La Cote-De-Beaupre',
  'Lac-Saint-Jean-Est', 'Les Sources', 'Le Granit',
  'Le Domaine-Du-Roy', 'Kamouraska', 'Beauce-Sartigan',
  'Abitibi', 'Abitibi-Ouest', 'Manicouagan', 'Mekinac',
  'Bonaventure', 'Temiscamingue', 'Temiscouata',
  'Rimouski-Neigette', 'La Vallee-De-L-Or', 'Maria-Chapdelaine',
  'Le Fjord-Du-Saguenay', 'Les Collines-De-L-Outaouais',
  'Pontiac', 'La Vallee-De-La-Gatineau', 'Robert-Cliche',
  'Marguerite-D-Youville', 'Therese-De Blainville',
  'La Riviere-Du-Nord', 'D-Autray', 'D-Artagnan', 'D-Arthabaska',
  -- Boroughs de Montreal
  'Ville-Marie', 'Le Plateau-Mont-Royal', 'Rosemont-La Petite-Patrie',
  'Cote-Des-Neiges-Notre-Dame-De-Grace', 'Le Sud-Ouest',
  'Ahuntsic-Cartierville', 'Villeray-Saint-Michel-Parc-Extension',
  'Riviere-Des-Prairies-Pointe-Aux-Trembles',
  'Mercier-Hochelaga-Maisonneuve', 'Pierrefonds-Roxboro',
  'Anjou', 'Lasalle', 'Verdun', 'Lachine',
  'Montreal-Nord', 'Saint-Leonard', 'Outremont', 'Saint-Laurent',
  'Mont-Royal', 'Dollard-Des-Ormeaux', 'Beaconsfield',
  'Baie-D-Urfe', 'Kirkland', 'Pointe-Claire', 'Dorval',
  'Cote-Saint-Luc', 'Hampstead', 'Montreal-Ouest', 'Montreal-Est',
  'Saint Laurent', 'Lasalle/Montreal', 'Lasalle/Montréal',
  -- Boroughs de Quebec
  'La Cite-Limoilou', 'Sainte-Foy-Sillery-Cap-Rouge',
  -- Sectores de Laval  
  'Chomedey', 'Sainte-Rose', 'Fabreville', 'Saint-Vincent-De-Paul',
  'Laval-Des-Rapides', 'Sainte-Dorothee', 'Vimont', 'Auteuil',
  'Duvernay', 'Pont-Viau', 'Laval-Ouest',
  -- Sectores de Longueuil
  'Saint-Hubert', 'Vieux-Longueuil',
  -- Variantes de nombre
  'Valle Del Richelieu', 'Valle Del Alto San Lorenzo',
  'Vallee-Du-Richelieu', 'Centru-Du-Quebec',
  'Centre-Du-Quebec', 'Capitale-Nationale',
  'Chaudiere-Appalaches', 'Gaspesie-Iles-De-La-Madeleine',
  'Bas-Saint-Laurent', 'Saguenay-Lac-Saint-Jean',
  'Cote-Nord', 'Capitale-Nationale', 'Capitale-Nacional',
  'Capitale‑Nationale', 'Chaudiere‑Appalaches',
  'Lanaudiere', 'Laurentides', 'Mauricie',
  'La Capitale-Nationale', 'Centru-Du-Quebec',
  'Maurice', 'Moteregie',
  'Isla De Montreal', 'Norte De New Brunswick',
  'Suroeste De Ontario', 'Alberta Rockies',
  'Nicolet Yamaska', 'Maskinonges',
  -- Saguenay sectors
  'Chicoutimi', 'La Baie', 'Jonquiere',
  'Regimen Des Laurentides', 'Région Des Laurentides',
  'Nicolet', 'Terrebone',
  'Montreal', 'Montréal',
  'Brossard', 'Granby', 'Gatineau',
  'Magog', 'Lachute', 'Lévis', 'Levis',
  'Quebec', 'Québec'
)
  AND qc.pueblo IS NOT NULL AND TRIM(qc.pueblo) <> '' AND TRIM(qc.pueblo) <> 'null'
  AND normalize_location_name(qc.ciudad) != normalize_location_name(qc.pueblo);

-- ── 4. QUEBEC: Casos especiales de MRC/zona sin pueblo válido ──
-- Copiar pueblo a ciudad para cuando ambos son region/MRC pero difieren
UPDATE quebec_companies qc
SET ciudad = normalize_location_name(qc.pueblo)
WHERE normalize_location_name(qc.ciudad) IN (
  'Nicolet', 'Nicolet Yamaska', 'Centru-Du-Quebec',
  'Capitale-Nacional', 'Capitale‑Nationale', 'Chaudiere‑Appalaches',
  'Maurice', 'Moteregie', 'Isla De Montreal',
  'Regimen Des Laurentides', 'Région Des Laurentides',
  'Norte De New Brunswick', 'Suroeste De Ontario',
  'Alberta Rockies', 'Maskinonges'
)
  AND qc.pueblo IS NOT NULL AND TRIM(qc.pueblo) <> '' AND TRIM(qc.pueblo) <> 'null';

-- ── 5. ONTARIO: Los suburbios/barrios que son parte de ciudades más grandes ──
-- Estos se dejan como están porque son lugares reales,
-- PERO asignamos la región correcta si está vacía

-- ── 6. CORREGIR 'Waterloo' en Ontario: Waterloo puede ser ciudad o región ──
-- Waterloo city (pueblo = 'Waterloo') vs Waterloo Region (pueblo = 'Kitchener', etc.)
UPDATE ontario_companies
SET ciudad = pueblo
WHERE normalize_location_name(ciudad) = 'Waterloo'
  AND normalize_location_name(ciudad) != normalize_location_name(pueblo)
  AND pueblo IS NOT NULL AND TRIM(pueblo) <> '' AND TRIM(pueblo) <> 'null';

-- ── 7. ONTARIO: Registrar Waterloo como 'Waterloo Region' en region cuando corresponda
UPDATE ontario_companies
SET region = 'Waterloo Region'
WHERE normalize_location_name(ciudad) IN ('Waterloo', 'Kitchener', 'Cambridge')
  AND (region IS NULL OR TRIM(region) = '' OR TRIM(region) = 'null');

-- ── 8. QUEBEC: Asignar region faltante basado en ciudad ──
UPDATE quebec_companies qc
SET region = 'Montreal'
WHERE (region IS NULL OR TRIM(region) = '' OR TRIM(region) = 'null')
  AND normalize_location_name(qc.ciudad) IN (
    'Montreal', 'Montreal-Nord', 'Montreal-Est', 'Montreal-Ouest',
    'Lasalle', 'Lachine', 'Verdun', 'Saint-Laurent', 'Saint-Leonard',
    'Outremont', 'Mont-Royal', 'Anjou', 'Cote-Saint-Luc',
    'Hampstead', 'Pointe-Claire', 'Dorval', 'Kirkland',
    'Beaconsfield', 'Baie-D-Urfe', 'Dollard-Des-Ormeaux',
    'Pierrefonds', 'Roxboro',
    'L-Ile-Perrot', 'Notre-Dame-De-L-Ile-Perrot', 'Pincourt',
    'Terrasse-Vaudreuil', 'Vaudreuil-Dorion', 'Coteau-Du-Lac',
    'Les Coteaux', 'Saint-Zotique', 'Saint-Polycarpe',
    'Rigaud', 'Hudson', 'Saint-Lazare'
  );

UPDATE quebec_companies qc
SET region = 'Laval'
WHERE (region IS NULL OR TRIM(region) = '' OR TRIM(region) = 'null')
  AND normalize_location_name(qc.ciudad) IN (
    'Laval', 'Chomedey', 'Sainte-Rose', 'Fabreville',
    'Saint-Vincent-De-Paul', 'Laval-Des-Rapides', 'Sainte-Dorothee',
    'Vimont', 'Auteuil', 'Duvernay', 'Pont-Viau', 'Laval-Ouest'
  );

UPDATE quebec_companies qc
SET region = 'Quebec'
WHERE (region IS NULL OR TRIM(region) = '' OR TRIM(region) = 'null')
  AND normalize_location_name(qc.ciudad) IN (
    'Quebec', 'Quebec City', 'Ville De Quebec',
    'Sainte-Foy', 'Sillery', 'Cap-Rouge', 'Charlesbourg',
    'Beauport', 'Limoilou', 'Loretteville', 'Val-Belair',
    'Saint-Emile', 'Vanier'
  );

UPDATE quebec_companies qc
SET region = 'Longueuil'
WHERE (region IS NULL OR TRIM(region) = '' OR TRIM(region) = 'null')
  AND normalize_location_name(qc.ciudad) IN (
    'Longueuil', 'Saint-Hubert', 'Vieux-Longueuil',
    'Greenfield Park', 'LeMoyne', 'Brossard', 'Saint-Lambert',
    'Boucherville'
  );

UPDATE quebec_companies qc
SET region = 'Gatineau'
WHERE (region IS NULL OR TRIM(region) = '' OR TRIM(region) = 'null')
  AND normalize_location_name(qc.ciudad) IN (
    'Gatineau', 'Hull', 'Aylmer', 'Buckingham', 'Masson-Angers'
  );

UPDATE quebec_companies qc
SET region = 'Sherbrooke'
WHERE (region IS NULL OR TRIM(region) = '' OR TRIM(region) = 'null')
  AND normalize_location_name(qc.ciudad) IN ('Sherbrooke', 'Fleurimont', 'Lennoxville', 'Rock Forest', 'Saint-Elie-D-Orford', 'Bromptonville');

UPDATE quebec_companies qc
SET region = 'Saguenay'
WHERE (region IS NULL OR TRIM(region) = '' OR TRIM(region) = 'null')
  AND normalize_location_name(qc.ciudad) IN ('Saguenay', 'Chicoutimi', 'Jonquiere', 'La Baie', 'Laterriere');

UPDATE quebec_companies qc
SET region = 'Trois-Rivieres'
WHERE (region IS NULL OR TRIM(region) = '' OR TRIM(region) = 'null')
  AND normalize_location_name(qc.ciudad) IN ('Trois-Rivieres', 'Trois-Rivieres-Ouest', 'Cap-De-La-Madeleine', 'Saint-Louis-De-France', 'Pointe-Du-Lac');

-- ── 9. ONTARIO: Asignar region faltante basado en ciudad ──
UPDATE ontario_companies oc
SET region = 'Greater Toronto Area'
WHERE (region IS NULL OR TRIM(region) = '' OR TRIM(region) = 'null' OR TRIM(region) = 'Toronto' OR TRIM(region) = 'Toronto Division')
  AND normalize_location_name(oc.ciudad) IN (
    'Toronto', 'Mississauga', 'Brampton', 'Caledon',
    'Milton', 'Burlington', 'Oakville', 'Halton Hills', 'Acton', 'Georgetown',
    'Markham', 'Vaughan', 'Richmond Hill', 'Aurora', 'Newmarket',
    'King', 'Whitchurch-Stouffville', 'East Gwillimbury', 'Georgina',
    'Ajax', 'Pickering', 'Whitby', 'Oshawa', 'Clarington', 'Bowmanville',
    'Cobourg', 'Port Hope', 'Brighton', 'Quinte West', 'Belleville',
    'North York', 'Etobicoke', 'Scarborough', 'York',
    'Mono', 'Orangeville', 'Shelburne',
    'Woodbridge', 'Unionville', 'Thornhill', 'Ancaster', 'Stoney Creek',
    'Waterdown', 'Beamsville', 'Grimsby', 'Lincoln'
  );

-- ── 10. QUEBEC: Re-asignar regiones estandarizadas ──
UPDATE quebec_companies SET region = 'Estrie'
WHERE normalize_location_name(region) IN ('Estrie / Cantons-De-L-Est', 'Estrie');

UPDATE quebec_companies SET region = 'Montreal'
WHERE region IS NOT NULL AND (
  normalize_location_name(region) IN ('Montreal', 'Montréal')
  OR region LIKE 'Montreal%'
  OR region LIKE 'Montréal%'
  OR region = 'Isla De Montreal'
);

UPDATE quebec_companies SET region = 'Montreal'
WHERE normalize_location_name(region) LIKE '%montreal%'
  OR normalize_location_name(region) LIKE '%montréal%';

UPDATE quebec_companies SET region = 'Montreal'
WHERE normalize_location_name(region) = 'Isla De Montreal'
  OR normalize_location_name(region) = 'Montréal (Lasalle)'
  OR normalize_location_name(region) = 'Montréal (Saint-Laurent)'
  OR normalize_location_name(region) = 'Montréal (Verdun)'
  OR normalize_location_name(region) = 'Montréal (Isla De Montreal)'
  OR normalize_location_name(region) = 'Montreal Central'
  OR normalize_location_name(region) = 'Montreal Oeste'
  OR normalize_location_name(region) = 'Montreal Este';

UPDATE quebec_companies SET region = 'Montreal'
WHERE normalize_location_name(region) IN (
  'Ahuntsic-Cartierville', 'Anjou', 'Cote-Des-Neiges-Notre-Dame-De-Grace',
  'Lachine', 'Lasalle', 'Le Plateau-Mont-Royal', 'Le Sud-Ouest',
  'Mercier-Hochelaga-Maisonneuve', 'Montreal-Nord', 'Outremont',
  'Pierrefonds-Roxboro', 'Riviere-Des-Prairies-Pointe-Aux-Trembles',
  'Rosemont-La Petite-Patrie', 'Saint-Laurent', 'Saint-Leonard',
  'Verdun', 'Ville-Marie', 'Villeray-Saint-Michel-Parc-Extension',
  'Dollard-Des Ormeaux', 'Dollard-Des-Ormeaux',
  'Cote-Saint-Luc', 'Hampstead', 'Montreal-Ouest', 'Montreal-Est',
  'Mont-Royal', 'Pointe-Claire', 'Dorval', 'Kirkland',
  'Beaconsfield', 'Baie-D-Urfe', 'Sainte-Anne-De-Bellevue',
  'Pierrefonds', 'Roxboro'
);

UPDATE quebec_companies SET region = 'Laval'
WHERE normalize_location_name(region) IN (
  'Laval', 'Chomedey', 'Sainte-Rose', 'Fabreville',
  'Saint-Vincent-De-Paul', 'Laval-Des-Rapides', 'Sainte-Dorothee',
  'Vimont', 'Auteuil', 'Duvernay', 'Pont-Viau', 'Laval-Ouest',
  'Laval (Ste-Rose)',
  ': Laval'
);

UPDATE quebec_companies SET region = 'Monteregie'
WHERE normalize_location_name(region) IN (
  'Monteregie', 'Moteregie', 'Montérégie', 'Montérégie-Est'
);

UPDATE quebec_companies SET region = 'Capitale-Nationale'
WHERE normalize_location_name(region) = 'Capitale-Nacional'
  OR normalize_location_name(region) = 'La Capitale-Nationale';

UPDATE quebec_companies SET region = 'Centre-Du-Quebec'
WHERE normalize_location_name(region) = 'Centru-Du-Quebec';

UPDATE quebec_companies SET region = 'Lanaudiere'
WHERE normalize_location_name(region) = 'Lanaudiere';

-- ── 11. Apóstrofes: normalizar variantes ──
UPDATE ontario_companies SET ciudad = REPLACE(ciudad, '''', '''') WHERE ciudad LIKE '%''%';
UPDATE quebec_companies SET ciudad = REPLACE(ciudad, '''', '''') WHERE ciudad LIKE '%''%';
UPDATE ontario_companies SET pueblo = REPLACE(pueblo, '''', '''') WHERE pueblo LIKE '%''%';
UPDATE quebec_companies SET pueblo = REPLACE(pueblo, '''', '''') WHERE pueblo LIKE '%''%';
UPDATE ontario_companies SET region = REPLACE(region, '''', '''') WHERE region LIKE '%''%';
UPDATE quebec_companies SET region = REPLACE(region, '''', '''') WHERE region LIKE '%''%';

-- ── 12. Aplicar normalize_location_name final a todos los campos ──
UPDATE ontario_companies SET ciudad = normalize_location_name(ciudad)
WHERE ciudad IS NOT NULL AND TRIM(ciudad) <> '' AND TRIM(ciudad) <> 'null';
UPDATE quebec_companies SET ciudad = normalize_location_name(ciudad)
WHERE ciudad IS NOT NULL AND TRIM(ciudad) <> '' AND TRIM(ciudad) <> 'null';
UPDATE ontario_companies SET pueblo = normalize_location_name(pueblo)
WHERE pueblo IS NOT NULL AND TRIM(pueblo) <> '' AND TRIM(pueblo) <> 'null';
UPDATE quebec_companies SET pueblo = normalize_location_name(pueblo)
WHERE pueblo IS NOT NULL AND TRIM(pueblo) <> '' AND TRIM(pueblo) <> 'null';
UPDATE ontario_companies SET region = normalize_location_name(region)
WHERE region IS NOT NULL AND TRIM(region) <> '' AND TRIM(region) <> 'null';
UPDATE quebec_companies SET region = normalize_location_name(region)
WHERE region IS NOT NULL AND TRIM(region) <> '' AND TRIM(region) <> 'null';

-- ── 13. Corregir misspellings comunes ──
UPDATE ontario_companies SET ciudad = 'Mississauga' WHERE LOWER(ciudad) = 'missisuaga';
UPDATE ontario_companies SET ciudad = 'Toronto' WHERE LOWER(ciudad) IN ('old toronto', 'downtown toronto');
UPDATE ontario_companies SET ciudad = 'St. Catharines' WHERE LOWER(ciudad) = 'st catharines' OR LOWER(ciudad) = 'st. catherines';
UPDATE quebec_companies SET ciudad = 'Montreal' WHERE LOWER(ciudad) IN ('downtown montreal', 'montreal qc', '· montreal');
UPDATE quebec_companies SET ciudad = 'Montreal' WHERE LOWER(ciudad) LIKE '%montreal%' AND LOWER(ciudad) NOT IN (
  'montreal', 'montreal-nord', 'montreal-est', 'montreal-ouest', 'montreal-east', 'montreal-quest',
  'vieux-montreal', 'old montreal', 'lasalle/montreal'
);

-- ── 14. Limpiar direcciones en campo ciudad ──
UPDATE ontario_companies SET ciudad = NULL WHERE ciudad IN (
  'Augusta Street', 'King Street North', 'Peel Street Area', 'Queen Street West',
  'Unit 11 Birchmount Road', 'Sparks Street', 'Bank Street', 'First Street',
  'Hess Street South', 'Rochester Street', 'Queens Quay W #155'
);

-- ── 15. Estandarizar nombres de regiones ──
UPDATE ontario_companies SET region = 'Greater Toronto Area' WHERE region IN ('Great Area Toronto', 'Toronto', 'Toronto Division', 'Toronto District', 'Greater Toronto');
UPDATE ontario_companies SET region = 'Niagara Region' WHERE region IN ('Niagara', 'Niagara Region', 'Niagara Peninsula', 'Niagara Regional Municipality');
UPDATE ontario_companies SET region = 'Hamilton' WHERE region IN ('Hamilton Division', 'Hamilton Region', 'Hamilton / City Of Hamilton');
UPDATE ontario_companies SET region = 'Ottawa' WHERE region IN ('Ottawa Division', 'Ottawa District', 'Ottawa / Ottawa Division');
UPDATE ontario_companies SET region = 'Waterloo Region' WHERE region IN ('Waterloo', 'Waterloo Regional Municipality');
UPDATE ontario_companies SET region = 'Peel Region' WHERE region = 'Peel';
UPDATE ontario_companies SET region = 'Durham Region' WHERE region = 'Durham';
UPDATE ontario_companies SET region = 'Halton Region' WHERE region = 'Halton';
UPDATE ontario_companies SET region = 'York Region' WHERE region = 'York';
UPDATE ontario_companies SET region = 'Simcoe County' WHERE region = 'Simcoe';
UPDATE ontario_companies SET region = 'Southwestern Ontario' WHERE region = 'Southwestern On';
UPDATE ontario_companies SET region = 'Middlesex County' WHERE region = 'Middlesex';
UPDATE ontario_companies SET region = 'Essex County' WHERE region = 'Essex';
UPDATE ontario_companies SET region = 'Wellington County' WHERE region = 'Wellington';

UPDATE quebec_companies SET region = 'Monteregie' WHERE region IN ('Monteregie', 'Moteregie', 'Montérégie', 'Montérégie-Est');
UPDATE quebec_companies SET region = 'Capitale-Nationale' WHERE region IN ('Capitale-Nationale', 'Capitale-Nacional', 'La Capitale-Nationale', 'Capitale‑Nationale');
UPDATE quebec_companies SET region = 'Chaudiere-Appalaches' WHERE region IN ('Chaudiere-Appalaches', 'Chaudiere‑Appalaches', 'Chanaudiere- Appalaches');
UPDATE quebec_companies SET region = 'Centre-Du-Quebec' WHERE region IN ('Centre-Du-Quebec', 'Centru-Du-Quebec');
UPDATE quebec_companies SET region = 'Lanaudiere' WHERE region IN ('Lanaudiere', 'Lanaudière', 'Lanaudiere');
UPDATE quebec_companies SET region = 'Montreal' WHERE region IN ('Montreal', 'Isla De Montreal', 'Montreal Central', 'Montreal Oeste', 'Montreal Este');
UPDATE quebec_companies SET region = 'Montreal' WHERE region LIKE 'Montréal%' OR region LIKE '%Montreal%' OR region LIKE '%Montréal%';
UPDATE quebec_companies SET region = 'Gatineau' WHERE region IN ('Gatineau', 'Ottawa');
UPDATE quebec_companies SET region = 'Saguenay-Lac-Saint-Jean' WHERE region IN ('Saguenay-Lac-Saint-Jean', 'Saguenay', 'Sagueney');
UPDATE quebec_companies SET region = 'Estrie' WHERE region = 'Estrie / Cantons-De-L-Est';
UPDATE quebec_companies SET region = 'Cote-Nord' WHERE region = 'Cote-Nord';

-- ── 16. Trigger para auto-normalizar nuevos registros ──
CREATE OR REPLACE FUNCTION auto_normalize_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ciudad IS NOT NULL AND TRIM(NEW.ciudad) <> '' AND TRIM(NEW.ciudad) <> 'null' THEN
    NEW.ciudad := normalize_location_name(NEW.ciudad);
  END IF;
  IF NEW.pueblo IS NOT NULL AND TRIM(NEW.pueblo) <> '' AND TRIM(NEW.pueblo) <> 'null' THEN
    NEW.pueblo := normalize_location_name(NEW.pueblo);
  END IF;
  IF NEW.region IS NOT NULL AND TRIM(NEW.region) <> '' AND TRIM(NEW.region) <> 'null' THEN
    NEW.region := normalize_location_name(NEW.region);
  END IF;
  IF NEW.provincia IS NOT NULL AND TRIM(NEW.provincia) <> '' AND TRIM(NEW.provincia) <> 'null' THEN
    NEW.provincia := normalize_location_name(NEW.provincia);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_ontario_location ON ontario_companies;
DROP TRIGGER IF EXISTS trg_normalize_quebec_location ON quebec_companies;

CREATE TRIGGER trg_normalize_ontario_location
  BEFORE INSERT OR UPDATE ON ontario_companies
  FOR EACH ROW EXECUTE FUNCTION auto_normalize_location();

CREATE TRIGGER trg_normalize_quebec_location
  BEFORE INSERT OR UPDATE ON quebec_companies
  FOR EACH ROW EXECUTE FUNCTION auto_normalize_location();

-- ── 17. Verificación final ──
SELECT 'Correccion de direcciones completada.' AS result;
SELECT 'Ontario - Ciudades unicas:' AS label, COUNT(DISTINCT ciudad) AS total FROM ontario_companies WHERE ciudad IS NOT NULL;
SELECT 'Quebec - Ciudades unicas:' AS label, COUNT(DISTINCT ciudad) AS total FROM quebec_companies WHERE ciudad IS NOT NULL;
