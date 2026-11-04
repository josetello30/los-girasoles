/**
 * Servicios (prototipo: grilla de 2 columnas con subtítulos).
 */
import { GrillaAmplia } from '@/componentes/GrillaServicios';
import { Pantalla } from '@/componentes/Pantalla';

export default function Servicios() {
  return (
    <Pantalla titulo="Servicios" conRegreso={false}>
      <GrillaAmplia />
    </Pantalla>
  );
}
