# Membuat db/seed.sql dari berkas Google Sheets yang ada (data awal website). Jalankan: python3 db/make_seed.py <xlsx> <keluaran.sql>
import sys,json,datetime,openpyxl
sys.path.insert(0,'.')
xl=sys.argv[1];out=sys.argv[2]
wb=openpyxl.load_workbook(xl)
SHEETS={'Peluang':'peluang','Titik_Peluang':'titik','Pabrik':'pabrik','Kecamatan':'kecamatan','Kontak':'kontak','Produksi_Komoditas':'produksi','Realisasi':'realisasi','Mitra_Usaha':'mitra'}
KUNCI={'peluang':['kode'],'titik':['kode','lintang','bujur'],'pabrik':['rantai','nama_fasilitas','lintang','bujur'],'kecamatan':['nama'],'produksi':['kecamatan','komoditas','tahun','periode'],'realisasi':['tahun','triwulan'],'kontak':['kunci'],'mitra':['kode']}
META=['status_data','nomor_ba','tanggal_mutakhir','terbit']
def sv(v):
    if v is None:return ''
    if isinstance(v,(datetime.datetime,datetime.date)):return v.strftime('%Y-%m-%d')
    if isinstance(v,float):
        return str(int(v)) if v==int(v) else repr(v).replace('.',',')
    return str(v).strip()
q=lambda s:"'"+str(s).replace("'","''")+"'"
L=['-- Data awal SIF POINT BATARA (diambil dari berkas Google Sheets yang sudah ada)']
INS=[('DPMPTSP','Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu','Pengelola SIF POINT BATARA; admin verifikator',0),('DISKOMINFOSANDI','Dinas Komunikasi, Informatika, dan Persandian','Walidata Daerah; Super Admin bersama Bidang Penanaman Modal',0),('BAPPERIDA','Badan Perencanaan Pembangunan, Riset dan Inovasi Daerah','Koordinator perencanaan dan penyelarasan data',0),('DISTAN','Dinas Pertanian','Produsen Data',1),('DKPP','Dinas Ketahanan Pangan dan Perikanan','Produsen Data',1),('DPUPR','Dinas Pekerjaan Umum dan Penataan Ruang','Produsen Data',1),('DLH','Dinas Lingkungan Hidup','Produsen Data',1),('DISDAGRIN','Dinas Perdagangan dan Perindustrian','Produsen Data',1),('DISNAKERTRANSKOP','Dinas Tenaga Kerja, Transmigrasi, Koperasi, Usaha Kecil dan Menengah','Produsen Data',1),('DISBUDPARPORA','Dinas Kebudayaan, Pariwisata, Kepemudaan dan Olahraga','Penyedia Data Penunjang',1)]
for k,n,p,a in INS:L.append(f"INSERT OR IGNORE INTO instansi (kode,nama,peran_sop,admin_data) VALUES ({q(k)},{q(n)},{q(p)},{a});")
WALI=[('produksi','*','DISTAN'),('kecamatan','pasar','DISDAGRIN'),('kecamatan','sarana_perdagangan','DISDAGRIN'),('kecamatan','komoditas_khas','DISDAGRIN'),('kecamatan','komoditas_utama','DISTAN'),('kecamatan','fasilitas_penunjang','DISNAKERTRANSKOP'),('kecamatan','fasilitas_penunjang','DISBUDPARPORA'),('kecamatan','fasilitas_penunjang','DISDAGRIN'),('kecamatan','pelabuhan','DPUPR'),('kecamatan','prasarana_lain','DPUPR'),('kecamatan','kawasan_rtrw_kode','DPUPR'),('kecamatan','kawasan_rtrw','DPUPR'),('kecamatan','pusat_kegiatan','DPUPR'),('kecamatan','keterangan_pusat','DPUPR'),('kecamatan','*','DPMPTSP'),('peluang','*','DPMPTSP'),('titik','*','DPMPTSP'),('pabrik','*','DPMPTSP'),('realisasi','*','DPMPTSP'),('kontak','*','DPMPTSP'),('mitra','*','DPMPTSP')]
for d,k,i in WALI:L.append(f"INSERT OR IGNORE INTO wali_aturan (dataset,kolom,instansi) VALUES ({q(d)},{q(k)},{q(i)});")
now=datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ');cnt={}
for sh,ds in SHEETS.items():
    ws=wb[sh];h=[c.value for c in ws[1]]
    for r in ws.iter_rows(min_row=2,values_only=True):
        row={h[i]:sv(r[i]) for i in range(len(h)) if h[i]}
        if not any(v for v in row.values()):continue
        data={k:v for k,v in row.items() if k not in META}
        kunci='|'.join(row.get(k,'') for k in KUNCI[ds])
        st=row.get('status_data') or 'sementara'
        if st not in('sementara','terverifikasi','resmi'):st='sementara'
        if ds=='kontak':st='resmi'
        terbit='ya' if row.get('terbit','').lower()=='ya' or ds=='kontak' and any(row.get('nilai','') for _ in[0]) else ''
        if ds=='kontak':terbit='ya'
        inst='DISTAN' if ds=='produksi' else 'DPMPTSP'
        dj=json.dumps(data,ensure_ascii=False)
        td=q(dj) if terbit=='ya' else 'NULL'
        tm=q(json.dumps({'status_data':st,'nomor_ba':row.get('nomor_ba',''),'tanggal_mutakhir':row.get('tanggal_mutakhir','')},ensure_ascii=False)) if terbit=='ya' else 'NULL'
        L.append(f"INSERT OR IGNORE INTO baris (dataset,kunci,instansi,data,status_data,nomor_ba,tanggal_mutakhir,terbit,terbit_data,terbit_meta,versi,diubah_oleh,diubah_pada) VALUES ({q(ds)},{q(kunci)},{q(inst)},{q(dj)},{q(st)},{q(row.get('nomor_ba',''))},{q(row.get('tanggal_mutakhir',''))},{q(terbit)},{td},{tm},1,'impor',{q(now)});")
        cnt[ds]=cnt.get(ds,0)+1
open(out,'w').write('\n'.join(L)+'\n');print(cnt)
