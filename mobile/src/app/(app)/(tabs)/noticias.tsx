/**
 * Alertas: comunicados, mantenimientos y avisos del club (RF03).
 */
import type { Noticia } from '@/api/tipos';
import { Cargando, ErrorVista, Vacio } from '@/componentes/basicos';
import { Pantalla } from '@/componentes/Pantalla';
import { TarjetaNoticia } from '@/componentes/TarjetaNoticia';
import { useConsulta } from '@/hooks/useConsulta';

export default function Noticias() {
  const { datos, cargando, error, refrescando, recargar } = useConsulta<Noticia[]>('/noticias');
  return (
    <Pantalla titulo="Alertas y Noticias" conRegreso={false} refrescando={refrescando} alRefrescar={recargar}>
      {cargando && <Cargando />}
      {error && !datos && <ErrorVista mensaje={error} alReintentar={recargar} />}
      {datos?.length === 0 && <Vacio icono="notifications-off-outline" texto="No hay comunicados vigentes" />}
      {datos?.map((n) => <TarjetaNoticia key={n.id} noticia={n} />)}
    </Pantalla>
  );
}
