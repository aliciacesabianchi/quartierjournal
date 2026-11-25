-- Readable organisation names for the CRM list (the seed took the first venue name of each website). Safe to re-run.
update public.crm_organisations o set name = v.n from (values
 ('opernhaus.ch','Opernhaus Zürich'),('8004.ch','8004.ch (Quartierportal Kreis 4)'),('data.stadt-zuerich.ch','Stadt Zürich (offene Daten)'),('fadenspule.ch','Fadenspule (fadenspule.ch)'),
 ('geburtundkind.ch','Geburt und Kind (geburtundkind.ch)'),('gfz-zh.ch','GFZ Familienzentren (gfz-zh.ch)'),('mitwirken.stadt-zuerich.ch','Stadt Zürich: Plattform Mitwirken'),('mmi.ch','MegaMarie (mmi.ch)'),
 ('nachbarschaftshilfe.ch','Nachbarschaftshilfe (nachbarschaftshilfe.ch)'),('pbz.ch','Pestalozzi-Bibliothek Zürich (PBZ)'),('quartieragenda.qv5.ch','Quartieragenda (qv5.ch)'),
 ('quartierverein-wiedikon.ch','Quartierverein Wiedikon'),('qv-hirslanden.ch','Quartierverein Hirslanden'),('qv-oerlikon.ch','Quartierverein Oerlikon'),('qvs.ch','Quartierverein Schwamendingen'),
 ('reformiert-zuerich.ch','Reformierte Kirche Zürich'),('seebach.ch','seebach.ch (Quartier Seebach)'),('stadt-zuerich.ch','Stadt Zürich'),('stolze-huesli.ch','Stolze Hüsli (stolze-huesli.ch)'),
 ('wipkingen.net','wipkingen.net (Quartier Wipkingen)'),('zuerich-albisrieden.ch','zuerich-albisrieden.ch (Quartier Albisrieden)'),('zuerich-hoengg.ch','zuerich-hoengg.ch (Quartier Höngg)'),
 ('zuerich.com','Zürich Tourismus (zuerich.com)'),('babykonzert.ch','Babykonzert (babykonzert.ch)'),('qh6.ch','Quartierhaus Kreis 6 (qh6.ch)')
) as v(h, n) where o.host = v.h;
